import * as nodeFs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { relative, resolve, join } from "node:path";
import { validatePolicy } from "./maintenance-policy.mjs";
import {
  validatePrivacyPolicy,
  validateStoredPrivacyPolicy,
} from "./privacy-policy.mjs";

function errorDecision(code, message) {
  return { ok: false, code, message };
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function valuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function throwIfAborted(signal) {
  if (signal?.aborted) {
    const error = new Error("PICM_SCAN_ABORTED: operation was cancelled before mutation");
    error.code = "PICM_SCAN_ABORTED";
    throw error;
  }
}

export function createMaintenanceConfigStore({
  cwd,
  gate,
  fs = nodeFs,
  randomId = randomUUID,
  lockRetryMs = 5,
  lockRetries = 100,
  processId = process.pid,
  isProcessAlive = (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      return error?.code === "EPERM";
    }
  },
} = {}) {
  if (!cwd) throw new Error("PiCM config store requires cwd");
  if (!gate) throw new Error("PiCM config store requires a Git read gate");

  const directory = join(cwd, ".picm");
  const configPath = join(directory, "config.json");
  const lockPath = `${configPath}.lock`;
  const recoveryPrefix = "config.json.lock.recovery-";

  async function authorize(toolName) {
    const decision = await gate.checkPath(toolName, configPath);
    if (!decision.allowed) {
      return errorDecision("CONFIG_ACCESS_BLOCKED", decision.reason ?? "config access is blocked");
    }
    return { ok: true };
  }

  async function validateDirectory() {
    let stat;
    try {
      stat = await fs.lstat(directory);
    } catch (error) {
      if (error?.code === "ENOENT") return { ok: true, exists: false };
      return errorDecision("CONFIG_DIRECTORY_STAT_FAILED", messageOf(error));
    }
    if (stat.isSymbolicLink()) {
      return errorDecision("CONFIG_DIRECTORY_SYMLINK_BLOCKED", ".picm must not be a symlink");
    }
    if (!stat.isDirectory()) {
      return errorDecision("CONFIG_DIRECTORY_NOT_DIRECTORY", ".picm must be a directory");
    }
    try {
      const [canonicalRoot, canonicalDirectory] = await Promise.all([
        fs.realpath(cwd),
        fs.realpath(directory),
      ]);
      const relation = relative(canonicalRoot, canonicalDirectory);
      if (relation === ".." || relation.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || resolve(canonicalDirectory) !== resolve(canonicalRoot, ".picm")) {
        return errorDecision("CONFIG_DIRECTORY_OUTSIDE_WORKTREE", ".picm must remain inside the canonical project root");
      }
    } catch (error) {
      return errorDecision("CONFIG_DIRECTORY_REALPATH_FAILED", messageOf(error));
    }
    return { ok: true, exists: true };
  }

  async function read({ authorizeAccess = true } = {}) {
    const directoryDecision = await validateDirectory();
    if (!directoryDecision.ok) return directoryDecision;
    if (!directoryDecision.exists) {
      return { ok: true, exists: false, config: undefined, maintenance: undefined };
    }

    let stat;
    try {
      stat = await fs.lstat(configPath);
    } catch (error) {
      if (error?.code === "ENOENT") return { ok: true, exists: false, config: undefined, maintenance: undefined };
      return errorDecision("CONFIG_STAT_FAILED", messageOf(error));
    }
    if (stat.isSymbolicLink()) return errorDecision("CONFIG_SYMLINK_BLOCKED", "PiCM config must not be a symlink");
    if (!stat.isFile()) return errorDecision("CONFIG_NOT_FILE", "PiCM config must be a regular file");

    if (authorizeAccess) {
      const access = await authorize("read");
      if (!access.ok) return access;
    }

    try {
      const text = await fs.readFile(configPath, "utf8");
      const config = JSON.parse(text);
      if (!config || typeof config !== "object" || Array.isArray(config)) {
        return errorDecision("CONFIG_INVALID_JSON_OBJECT", "maintenance config root must be a JSON object");
      }
      let maintenance;
      let privacy;
      try {
        if (Object.hasOwn(config, "maintenance")) maintenance = validatePolicy(config.maintenance);
        if (Object.hasOwn(config, "privacy")) privacy = validateStoredPrivacyPolicy(config.privacy, cwd);
      } catch (error) {
        return errorDecision(error.code ?? "INVALID_CONFIG", messageOf(error));
      }
      return { ok: true, exists: true, config, maintenance, privacy, mode: stat.mode };
    } catch (error) {
      return errorDecision(
        error instanceof SyntaxError ? "CONFIG_INVALID_JSON" : "CONFIG_READ_FAILED",
        messageOf(error),
      );
    }
  }

  async function recoverStaleLock() {
    let recoveryPath;
    try {
      for (const entry of await fs.readdir(directory)) {
        if (entry.startsWith(recoveryPrefix)) {
          try { await fs.unlink(join(directory, entry)); } catch {}
        }
      }
      recoveryPath = join(directory, `${recoveryPrefix}${processId}-${randomId()}`);
      await fs.link(lockPath, recoveryPath);
    } catch (error) {
      if (error?.code === "ENOENT") return true;
      return false;
    }
    try {
      const owner = JSON.parse(await fs.readFile(recoveryPath, "utf8"));
      if (!Number.isSafeInteger(owner?.pid) || typeof owner?.token !== "string" || isProcessAlive(owner.pid)) {
        return false;
      }
      const [lockStat, recoveryStat] = await Promise.all([
        fs.stat(lockPath),
        fs.stat(recoveryPath),
      ]);
      if (
        lockStat.dev !== recoveryStat.dev ||
        lockStat.ino !== recoveryStat.ino ||
        recoveryStat.nlink !== 2
      ) return false;
      await fs.unlink(lockPath);
      return true;
    } catch {
      return false;
    } finally {
      try { await fs.unlink(recoveryPath); } catch {}
    }
  }

  async function acquireLock(waitForLock) {
    for (let attempt = 0; ; attempt += 1) {
      const token = randomId();
      let handle;
      try {
        handle = await fs.open(lockPath, "wx", 0o600);
        await handle.writeFile(`${JSON.stringify({ pid: processId, token })}\n`, "utf8");
        await handle.sync();
        return { ok: true, handle, token };
      } catch (error) {
        if (error?.code !== "EEXIST") {
          try { await handle?.close(); } catch {}
          if (handle) {
            try { await fs.unlink(lockPath); } catch {}
          }
          throw error;
        }
        if (await recoverStaleLock()) continue;
        if (!waitForLock || attempt >= lockRetries) {
          return errorDecision("CONFIG_LOCKED", "PiCM config is locked by another update");
        }
        await delay(lockRetryMs);
      }
    }
  }

  async function mutateConfigField(field, validValue, {
    expectedValue,
    conditional = false,
    conflictCode,
    conflictMessage,
    authorizeAccess = true,
    signal,
  } = {}) {
    throwIfAborted(signal);
    const initial = await read({ authorizeAccess });
    throwIfAborted(signal);
    if (!initial.ok) return initial;
    if (!conditional && !initial.exists && validValue === undefined) {
      return { ok: true, changed: false, exists: false, [field]: undefined };
    }

    if (authorizeAccess) {
      const writeAccess = await authorize("write");
      if (!writeAccess.ok) return writeAccess;
    }

    let lockHandle;
    let lockToken;
    let tempHandle;
    const tempPath = `${configPath}.tmp-${process.pid}-${randomId()}`;
    try {
      await fs.mkdir(directory, { recursive: true });
      const beforeLock = await validateDirectory();
      if (!beforeLock.ok) return beforeLock;

      const lock = await acquireLock(conditional);
      if (!lock.ok) return lock;
      lockHandle = lock.handle;
      lockToken = lock.token;

      const underLockDirectory = await validateDirectory();
      if (!underLockDirectory.ok) return underLockDirectory;
      if (authorizeAccess) {
        const underLockAccess = await authorize("write");
        if (!underLockAccess.ok) return underLockAccess;
      }

      const current = await read({ authorizeAccess });
      if (!current.ok) return current;
      if (conditional && !valuesEqual(current[field], expectedValue)) {
        return {
          ok: true,
          changed: false,
          conflict: true,
          code: conflictCode,
          message: conflictMessage,
          [field]: current[field],
        };
      }

      const nextConfig = current.exists
        ? { ...current.config }
        : { version: 1, generatedBy: "picm-factory" };
      if (validValue === undefined) delete nextConfig[field];
      else nextConfig[field] = validValue;

      const currentSerialized = current.exists ? `${JSON.stringify(current.config, null, 2)}\n` : undefined;
      const nextSerialized = `${JSON.stringify(nextConfig, null, 2)}\n`;
      if (currentSerialized === nextSerialized) {
        return { ok: true, changed: false, exists: true, config: nextConfig, [field]: validValue };
      }

      const beforeTempDirectory = await validateDirectory();
      if (!beforeTempDirectory.ok) return beforeTempDirectory;
      if (authorizeAccess) {
        const beforeTempAccess = await authorize("write");
        if (!beforeTempAccess.ok) return beforeTempAccess;
      }

      // Preserve ordinary permission bits; special mode bits are intentionally stripped.
      const ordinaryMode = current.exists ? current.mode & 0o777 : 0o644;
      tempHandle = await fs.open(tempPath, "wx", ordinaryMode);
      await tempHandle.writeFile(nextSerialized, "utf8");
      await tempHandle.sync();
      await tempHandle.close();
      tempHandle = undefined;
      if (current.exists) await fs.chmod(tempPath, ordinaryMode);

      const beforeRenameDirectory = await validateDirectory();
      if (!beforeRenameDirectory.ok) return beforeRenameDirectory;
      if (authorizeAccess) {
        const beforeRenameAccess = await authorize("write");
        if (!beforeRenameAccess.ok) return beforeRenameAccess;
      }
      throwIfAborted(signal);
      await fs.rename(tempPath, configPath);

      try {
        const directoryHandle = await fs.open(directory, "r");
        try {
          await directoryHandle.sync();
        } finally {
          await directoryHandle.close();
        }
      } catch (error) {
        return {
          ok: true,
          changed: true,
          committed: true,
          code: "CONFIG_COMMITTED_SYNC_FAILED",
          warning: `PiCM config was committed but directory sync failed: ${messageOf(error)}`,
          exists: true,
          config: nextConfig,
          [field]: validValue,
        };
      }
      return { ok: true, changed: true, committed: true, exists: true, config: nextConfig, [field]: validValue };
    } catch (error) {
      if (error?.code === "PICM_SCAN_ABORTED") throw error;
      return errorDecision("CONFIG_WRITE_FAILED", messageOf(error));
    } finally {
      try { await tempHandle?.close(); } catch {}
      try { await fs.unlink(tempPath); } catch {}
      try { await lockHandle?.close(); } catch {}
      if (lockHandle) {
        try {
          const owner = JSON.parse(await fs.readFile(lockPath, "utf8"));
          if (owner.pid === processId && owner.token === lockToken) await fs.unlink(lockPath);
        } catch {}
      }
    }
  }

  async function updateMaintenance(maintenance) {
    let validMaintenance;
    try {
      validMaintenance = maintenance === undefined ? undefined : validatePolicy(maintenance);
    } catch (error) {
      return errorDecision(error.code ?? "INVALID_POLICY", messageOf(error));
    }
    return mutateConfigField("maintenance", validMaintenance);
  }

  async function compareAndUpdateMaintenance(expectedMaintenance, maintenance, { signal } = {}) {
    let validExpected;
    let validMaintenance;
    try {
      validExpected = expectedMaintenance === undefined ? undefined : validatePolicy(expectedMaintenance);
      validMaintenance = maintenance === undefined ? undefined : validatePolicy(maintenance);
    } catch (error) {
      return errorDecision(error.code ?? "INVALID_POLICY", messageOf(error));
    }
    return mutateConfigField("maintenance", validMaintenance, {
      expectedValue: validExpected,
      conditional: true,
      conflictCode: "MAINTENANCE_POLICY_CONFLICT",
      conflictMessage: "maintenance policy changed before the conditional update",
      signal,
    });
  }

  async function updatePrivacy(privacy) {
    let validPrivacy;
    try {
      validPrivacy = privacy === undefined ? undefined : validatePrivacyPolicy(privacy, cwd);
    } catch (error) {
      return errorDecision(error.code ?? "INVALID_PRIVACY_POLICY", messageOf(error));
    }
    return mutateConfigField("privacy", validPrivacy);
  }

  async function compareAndUpdatePrivacy(expectedPrivacy, privacy) {
    let validExpected;
    let validPrivacy;
    try {
      validExpected = expectedPrivacy === undefined ? undefined : validateStoredPrivacyPolicy(expectedPrivacy, cwd);
      validPrivacy = privacy === undefined ? undefined : validatePrivacyPolicy(privacy, cwd);
    } catch (error) {
      return errorDecision(error.code ?? "INVALID_PRIVACY_POLICY", messageOf(error));
    }
    return mutateConfigField("privacy", validPrivacy, {
      expectedValue: validExpected,
      conditional: true,
      conflictCode: "PRIVACY_POLICY_CONFLICT",
      conflictMessage: "privacy exclusions changed before the conditional update",
    });
  }

  async function readPrivacyForReview() {
    return read({ authorizeAccess: false });
  }

  async function compareAndUpdatePrivacyForReview(expectedPrivacy, privacy) {
    let validExpected;
    let validPrivacy;
    try {
      validExpected = expectedPrivacy === undefined ? undefined : validateStoredPrivacyPolicy(expectedPrivacy, cwd);
      validPrivacy = privacy === undefined ? undefined : validatePrivacyPolicy(privacy, cwd);
    } catch (error) {
      return errorDecision(error.code ?? "INVALID_PRIVACY_POLICY", messageOf(error));
    }
    return mutateConfigField("privacy", validPrivacy, {
      expectedValue: validExpected,
      conditional: true,
      conflictCode: "PRIVACY_POLICY_CONFLICT",
      conflictMessage: "privacy exclusions changed before the conditional update",
      authorizeAccess: false,
    });
  }

  return {
    configPath,
    read,
    updateMaintenance,
    compareAndUpdateMaintenance,
    updatePrivacy,
    compareAndUpdatePrivacy,
    readPrivacyForReview,
    compareAndUpdatePrivacyForReview,
  };
}
