import * as nodeFs from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import type { Stats } from "node:fs";
import { codedError, errorCode } from "./errors.ts";
import type { MaintenancePolicy } from "./maintenance-policy.ts";
import type { StoredPrivacyPolicy } from "./privacy-policy.ts";
import { randomUUID } from "node:crypto";
import { relative, resolve, join } from "node:path";
import { validatePolicy } from "./maintenance-policy.ts";
import {
  projectStoredPrivacyPolicy,
  validatePrivacyPolicy,
  validateStoredPrivacyPolicy,
} from "./privacy-policy.ts";

type ConfigFields = { maintenance?: MaintenancePolicy; privacy?: StoredPrivacyPolicy };
type MutationDetails = ConfigFields & {
  changed?: boolean;
  committed?: boolean;
  conflict?: boolean;
  code?: string;
  message?: string;
  warning?: string;
  exists?: boolean;
  config?: Record<string, unknown>;
};
export type ConfigFailure = MutationDetails & { ok: false; code: string; message: string };
export type ConfigMutationResult = ConfigFailure | (MutationDetails & { ok: true });
type ConfigReadResult = ConfigFailure | (ConfigFields & { ok: true } & (
  { exists: false; config?: undefined; mode?: undefined; sourceText?: undefined } |
  { exists: true; config: Record<string, unknown>; mode: number; sourceText: string }
));
type StoreOptions = {
  cwd?: string;
  fs?: typeof nodeFs;
  randomId?: () => string;
  lockRetryMs?: number;
  lockRetries?: number;
  processId?: number;
  isProcessAlive?: (pid: number) => boolean;
};
export type MutationOptions = { signal?: AbortSignal };

function errorDecision(code: string, message: string): ConfigFailure {
  return { ok: false, code, message };
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function valuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function delay(milliseconds: number) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) {
    const error = codedError("CONFIG_OPERATION_CANCELLED", "CONFIG_OPERATION_CANCELLED: operation was cancelled before mutation");
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function createMaintenanceConfigStore({
  cwd: configuredCwd,
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
      return errorCode(error) === "EPERM";
    }
  },
}: StoreOptions = {}) {
  if (!configuredCwd) throw new Error("PiCM config store requires cwd");
  const cwd = configuredCwd;

  const directory = join(cwd, ".picm");
  const configPath = join(directory, "config.json");
  const projectPrivacyExclusions = (privacy: unknown) => projectStoredPrivacyPolicy(privacy, cwd);
  const lockPath = `${configPath}.lock`;
  const recoveryPrefix = "config.json.lock.recovery-";

  async function validateDirectory(): Promise<ConfigFailure | { ok: true; exists: boolean }> {
    let stat;
    try {
      stat = await fs.lstat(directory);
    } catch (error) {
      if (errorCode(error) === "ENOENT") return { ok: true, exists: false };
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

  async function validateConfigFile(): Promise<ConfigFailure | { ok: true; exists: false } | { ok: true; exists: true; stat: Stats }> {
    let stat;
    try {
      stat = await fs.lstat(configPath);
    } catch (error) {
      if (errorCode(error) === "ENOENT") return { ok: true, exists: false };
      return errorDecision("CONFIG_STAT_FAILED", messageOf(error));
    }
    if (stat.isSymbolicLink()) return errorDecision("CONFIG_SYMLINK_BLOCKED", "PiCM config must not be a symlink");
    if (!stat.isFile()) return errorDecision("CONFIG_NOT_FILE", "PiCM config must be a regular file");
    if (stat.nlink !== 1) return errorDecision("CONFIG_HARDLINK_BLOCKED", "PiCM config must have exactly one hard link");
    try {
      const [canonicalRoot, canonicalConfig] = await Promise.all([
        fs.realpath(cwd),
        fs.realpath(configPath),
      ]);
      if (resolve(canonicalConfig) !== resolve(canonicalRoot, ".picm", "config.json")) {
        return errorDecision("CONFIG_OUTSIDE_WORKTREE", "PiCM config must be the canonical project .picm/config.json");
      }
    } catch (error) {
      return errorDecision("CONFIG_REALPATH_FAILED", messageOf(error));
    }
    return { ok: true, exists: true, stat };
  }

  async function read(): Promise<ConfigReadResult> {
    const directoryDecision = await validateDirectory();
    if (!directoryDecision.ok) return directoryDecision;
    if (!directoryDecision.exists) {
      return { ok: true, exists: false, config: undefined, maintenance: undefined };
    }

    const fileDecision = await validateConfigFile();
    if (!fileDecision.ok) return fileDecision;
    if (!fileDecision.exists) return { ok: true, exists: false, config: undefined, maintenance: undefined };

    try {
      const text = await fs.readFile(configPath, "utf8");
      const config: unknown = JSON.parse(text);
      if (!isRecord(config)) {
        return errorDecision("CONFIG_INVALID_JSON_OBJECT", "maintenance config root must be a JSON object");
      }
      let maintenance;
      let privacy;
      try {
        if (Object.hasOwn(config, "maintenance")) maintenance = validatePolicy(config.maintenance);
        if (Object.hasOwn(config, "privacy")) privacy = validateStoredPrivacyPolicy(config.privacy, cwd);
      } catch (error) {
        return errorDecision(errorCode(error) ?? "INVALID_CONFIG", messageOf(error));
      }
      return { ok: true, exists: true, config, maintenance, privacy, mode: fileDecision.stat.mode, sourceText: text };
    } catch (error) {
      return errorDecision(
        error instanceof SyntaxError ? "CONFIG_INVALID_JSON" : "CONFIG_READ_FAILED",
        error instanceof SyntaxError ? "PiCM config is not valid JSON" : messageOf(error),
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
      if (errorCode(error) === "ENOENT") return true;
      return false;
    }
    try {
      const owner: unknown = JSON.parse(await fs.readFile(recoveryPath, "utf8"));
      if (!isRecord(owner) || typeof owner.pid !== "number" || !Number.isSafeInteger(owner.pid) || typeof owner.token !== "string" || isProcessAlive(owner.pid)) {
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

  async function acquireLock(waitForLock: boolean): Promise<ConfigFailure | { ok: true; handle: FileHandle; token: string }> {
    for (let attempt = 0; ; attempt += 1) {
      const token = randomId();
      let handle;
      try {
        handle = await fs.open(lockPath, "wx", 0o600);
        await handle.writeFile(`${JSON.stringify({ pid: processId, token })}\n`, "utf8");
        await handle.sync();
        return { ok: true, handle, token };
      } catch (error) {
        if (errorCode(error) !== "EEXIST") {
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

  async function mutateConfigField<K extends keyof ConfigFields, V extends ConfigFields[K]>(field: K, validValue: V, {
    expectedValue,
    conditional = false,
    conflictCode,
    conflictMessage,
    selectCurrentValue = (value) => value,
    mergeCurrentValue = (_current, next) => next,
    signal,
  }: MutationOptions & {
    expectedValue?: unknown;
    conditional?: boolean;
    conflictCode?: string;
    conflictMessage?: string;
    selectCurrentValue?: (value: ConfigFields[K]) => unknown;
    mergeCurrentValue?: (current: ConfigFields[K], next: V) => ConfigFields[K];
  } = {}): Promise<ConfigMutationResult> {
    throwIfAborted(signal);
    const initial = await read();
    throwIfAborted(signal);
    if (!initial.ok) return initial;
    if (conditional && !valuesEqual(selectCurrentValue(initial[field]), expectedValue)) {
      return {
        ok: true,
        changed: false,
        conflict: true,
        code: conflictCode,
        message: conflictMessage,
        [field]: selectCurrentValue(initial[field]),
      };
    }
    if (!conditional && !initial.exists && validValue === undefined) {
      return { ok: true, changed: false, exists: false, [field]: undefined };
    }

    let lockHandle: FileHandle | undefined;
    let lockToken: string | undefined;
    let tempHandle: FileHandle | undefined;
    let directoryMayHaveBeenCreated = false;
    const tempPath = `${configPath}.tmp-${process.pid}-${randomId()}`;
    try {
      const beforeDirectory = await validateDirectory();
      if (!beforeDirectory.ok) return beforeDirectory;
      await fs.mkdir(directory, { recursive: true });
      directoryMayHaveBeenCreated = !beforeDirectory.exists;
      const beforeLock = await validateDirectory();
      if (!beforeLock.ok) return beforeLock;

      const lock = await acquireLock(conditional);
      if (!lock.ok) return lock;
      lockHandle = lock.handle;
      lockToken = lock.token;

      const underLockDirectory = await validateDirectory();
      if (!underLockDirectory.ok) return underLockDirectory;
      const current = await read();
      if (!current.ok) return current;
      if (conditional && !valuesEqual(selectCurrentValue(current[field]), expectedValue)) {
        return {
          ok: true,
          changed: false,
          conflict: true,
          code: conflictCode,
          message: conflictMessage,
          [field]: selectCurrentValue(current[field]),
        };
      }

      const nextConfig: Record<string, unknown> = current.exists
        ? { ...current.config }
        : { version: 1, generatedBy: "picm-factory" };
      const nextValue = mergeCurrentValue(current[field], validValue);
      if (nextValue === undefined) delete nextConfig[field];
      else nextConfig[field] = nextValue;

      const currentSerialized = current.exists ? `${JSON.stringify(current.config, null, 2)}\n` : undefined;
      const nextSerialized = `${JSON.stringify(nextConfig, null, 2)}\n`;
      if (currentSerialized === nextSerialized) {
        return { ok: true, changed: false, exists: true, config: nextConfig, [field]: validValue };
      }

      const beforeTempDirectory = await validateDirectory();
      if (!beforeTempDirectory.ok) return beforeTempDirectory;
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
      const beforeRenameFile = await validateConfigFile();
      if (!beforeRenameFile.ok) return beforeRenameFile;
      if (beforeRenameFile.exists !== current.exists) {
        return errorDecision("CONFIG_CHANGED_BEFORE_WRITE", "PiCM config existence changed before publication");
      }
      const beforePublish = await read();
      if (!beforePublish.ok) return beforePublish;
      if (beforePublish.exists !== current.exists || beforePublish.sourceText !== current.sourceText) {
        return { ok: true, changed: false, conflict: true, code: "CONFIG_CHANGED_BEFORE_WRITE", message: "PiCM config changed before publication" };
      }
      throwIfAborted(signal);
      await fs.rename(tempPath, configPath);
      // Publication commits the update; late cancellation cannot undo it.

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
          warning: `PiCM config was committed but directory sync failed; crash durability is uncertain: ${messageOf(error)}`,
          exists: true,
          config: nextConfig,
          [field]: validValue,
        };
      }
      return { ok: true, changed: true, committed: true, exists: true, config: nextConfig, [field]: validValue };
    } catch (error) {
      if (errorCode(error) === "CONFIG_OPERATION_CANCELLED") {
        if (directoryMayHaveBeenCreated && error instanceof Error) {
          error.message += "; .picm/ may have been created and retained";
          Object.assign(error, { possibleCreatedDirectory: true });
        }
        throw error;
      }
      return errorDecision("CONFIG_WRITE_FAILED", messageOf(error));
    } finally {
      try { await tempHandle?.close(); } catch {}
      try { await fs.unlink(tempPath); } catch {}
      try { await lockHandle?.close(); } catch {}
      if (lockHandle) {
        try {
          const owner: unknown = JSON.parse(await fs.readFile(lockPath, "utf8"));
          if (isRecord(owner) && owner.pid === processId && owner.token === lockToken) await fs.unlink(lockPath);
        } catch {}
      }
    }
  }

  async function updateMaintenance(maintenance: unknown) {
    let validMaintenance;
    try {
      validMaintenance = maintenance === undefined ? undefined : validatePolicy(maintenance);
    } catch (error) {
      return errorDecision(errorCode(error) ?? "INVALID_POLICY", messageOf(error));
    }
    return mutateConfigField("maintenance", validMaintenance);
  }

  async function compareAndUpdateMaintenance(expectedMaintenance: unknown, maintenance: unknown, { signal }: MutationOptions = {}) {
    let validExpected;
    let validMaintenance;
    try {
      validExpected = expectedMaintenance === undefined ? undefined : validatePolicy(expectedMaintenance);
      validMaintenance = maintenance === undefined ? undefined : validatePolicy(maintenance);
    } catch (error) {
      return errorDecision(errorCode(error) ?? "INVALID_POLICY", messageOf(error));
    }
    return mutateConfigField("maintenance", validMaintenance, {
      expectedValue: validExpected,
      conditional: true,
      conflictCode: "MAINTENANCE_POLICY_CONFLICT",
      conflictMessage: "maintenance policy changed before the conditional update",
      signal,
    });
  }

  async function readSettings() {
    const result = await read();
    if (!result.ok) return result;
    return {
      ok: true,
      exists: result.exists,
      privacy: projectPrivacyExclusions(result.privacy) ?? null,
    };
  }

  async function compareAndUpdatePrivacyExclusions(expectedExcludedPaths: unknown, excludedPaths: unknown, { signal }: MutationOptions = {}) {
    let expectedPrivacy;
    let nextPrivacy;
    try {
      expectedPrivacy = expectedExcludedPaths === undefined
        ? undefined
        : { excludedPaths: validatePrivacyPolicy({ excludedPaths: expectedExcludedPaths }, cwd).excludedPaths };
      nextPrivacy = { excludedPaths: validatePrivacyPolicy({ excludedPaths }, cwd).excludedPaths };
    } catch (error) {
      return errorDecision(errorCode(error) ?? "INVALID_PRIVACY_POLICY", messageOf(error));
    }

    const result = await mutateConfigField("privacy", nextPrivacy, {
      expectedValue: expectedPrivacy,
      conditional: true,
      conflictCode: "PRIVACY_POLICY_CONFLICT",
      conflictMessage: "privacy exclusions changed before the conditional update",
      selectCurrentValue: projectPrivacyExclusions,
      mergeCurrentValue: (current, next) => ({
        ...(isRecord(current) ? current : {}),
        excludedPaths: next.excludedPaths,
      }),
      signal,
    });
    if (!result.ok || result.conflict) {
      return {
        ok: result.ok,
        changed: result.changed,
        conflict: result.conflict,
        code: result.code,
        message: result.message,
        privacy: projectPrivacyExclusions(result.privacy),
      };
    }
    return {
      ok: true,
      changed: result.changed,
      committed: result.committed,
      code: result.code,
      warning: result.warning,
      exists: result.exists,
      privacy: projectPrivacyExclusions(result.privacy),
    };
  }

  return {
    configPath,
    read,
    readSettings,
    updateMaintenance,
    compareAndUpdateMaintenance,
    compareAndUpdatePrivacyExclusions,
  };
}
