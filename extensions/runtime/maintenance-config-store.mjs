import * as nodeFs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { relative, resolve, join } from "node:path";
import { validatePolicy } from "./maintenance-policy.mjs";

function errorDecision(code, message) {
  return { ok: false, code, message };
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function policiesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
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
  if (!cwd) throw new Error("Maintenance config store requires cwd");
  if (!gate) throw new Error("Maintenance config store requires a Git read gate");

  const directory = join(cwd, ".picm");
  const configPath = join(directory, "config.json");
  const lockPath = `${configPath}.lock`;

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

  async function read() {
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
    if (stat.isSymbolicLink()) return errorDecision("CONFIG_SYMLINK_BLOCKED", "maintenance config must not be a symlink");
    if (!stat.isFile()) return errorDecision("CONFIG_NOT_FILE", "maintenance config must be a regular file");

    const access = await authorize("read");
    if (!access.ok) return access;

    try {
      const text = await fs.readFile(configPath, "utf8");
      const config = JSON.parse(text);
      if (!config || typeof config !== "object" || Array.isArray(config)) {
        return errorDecision("CONFIG_INVALID_JSON_OBJECT", "maintenance config root must be a JSON object");
      }
      let maintenance;
      if (Object.hasOwn(config, "maintenance")) {
        try {
          maintenance = validatePolicy(config.maintenance);
        } catch (error) {
          return errorDecision(error.code ?? "INVALID_POLICY", messageOf(error));
        }
      }
      return { ok: true, exists: true, config, maintenance, mode: stat.mode };
    } catch (error) {
      return errorDecision(
        error instanceof SyntaxError ? "CONFIG_INVALID_JSON" : "CONFIG_READ_FAILED",
        messageOf(error),
      );
    }
  }

  async function recoverStaleLock() {
    let owner;
    try {
      owner = JSON.parse(await fs.readFile(lockPath, "utf8"));
    } catch {
      return false;
    }
    if (!Number.isSafeInteger(owner?.pid) || typeof owner?.token !== "string" || isProcessAlive(owner.pid)) {
      return false;
    }
    const stalePath = `${lockPath}.stale-${owner.token}-${randomId()}`;
    try {
      await fs.rename(lockPath, stalePath);
    } catch (error) {
      if (error?.code === "ENOENT") return true;
      return false;
    }
    try {
      const movedOwner = JSON.parse(await fs.readFile(stalePath, "utf8"));
      if (movedOwner.pid !== owner.pid || movedOwner.token !== owner.token) {
        await fs.rename(stalePath, lockPath);
        return false;
      }
      await fs.unlink(stalePath);
      return true;
    } catch {
      try { await fs.rename(stalePath, lockPath); } catch {}
      return false;
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
          return errorDecision("CONFIG_LOCKED", "maintenance config is locked by another update");
        }
        await delay(lockRetryMs);
      }
    }
  }

  async function mutateMaintenance(validMaintenance, { expectedMaintenance, conditional = false } = {}) {
    const initial = await read();
    if (!initial.ok) return initial;
    if (!conditional && !initial.exists && validMaintenance === undefined) {
      return { ok: true, changed: false, exists: false, maintenance: undefined };
    }

    const writeAccess = await authorize("write");
    if (!writeAccess.ok) return writeAccess;

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
      const underLockAccess = await authorize("write");
      if (!underLockAccess.ok) return underLockAccess;

      const current = await read();
      if (!current.ok) return current;
      if (conditional && !policiesEqual(current.maintenance, expectedMaintenance)) {
        return {
          ok: true,
          changed: false,
          conflict: true,
          code: "MAINTENANCE_POLICY_CONFLICT",
          message: "maintenance policy changed before the conditional update",
          maintenance: current.maintenance,
        };
      }

      const nextConfig = current.exists
        ? { ...current.config }
        : { version: 1, generatedBy: "picm-factory" };
      if (validMaintenance === undefined) delete nextConfig.maintenance;
      else nextConfig.maintenance = validMaintenance;

      const currentSerialized = current.exists ? `${JSON.stringify(current.config, null, 2)}\n` : undefined;
      const nextSerialized = `${JSON.stringify(nextConfig, null, 2)}\n`;
      if (currentSerialized === nextSerialized) {
        return { ok: true, changed: false, exists: true, config: nextConfig, maintenance: validMaintenance };
      }

      const beforeTempDirectory = await validateDirectory();
      if (!beforeTempDirectory.ok) return beforeTempDirectory;
      const beforeTempAccess = await authorize("write");
      if (!beforeTempAccess.ok) return beforeTempAccess;

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
      const beforeRenameAccess = await authorize("write");
      if (!beforeRenameAccess.ok) return beforeRenameAccess;
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
          warning: `maintenance config was committed but directory sync failed: ${messageOf(error)}`,
          exists: true,
          config: nextConfig,
          maintenance: validMaintenance,
        };
      }
      return { ok: true, changed: true, committed: true, exists: true, config: nextConfig, maintenance: validMaintenance };
    } catch (error) {
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
    return mutateMaintenance(validMaintenance);
  }

  async function compareAndUpdateMaintenance(expectedMaintenance, maintenance) {
    let validExpected;
    let validMaintenance;
    try {
      validExpected = expectedMaintenance === undefined ? undefined : validatePolicy(expectedMaintenance);
      validMaintenance = maintenance === undefined ? undefined : validatePolicy(maintenance);
    } catch (error) {
      return errorDecision(error.code ?? "INVALID_POLICY", messageOf(error));
    }
    return mutateMaintenance(validMaintenance, { expectedMaintenance: validExpected, conditional: true });
  }

  return { configPath, read, updateMaintenance, compareAndUpdateMaintenance };
}
