import { realpathSync } from "node:fs";
import { stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { createMaintenanceConfigStore } from "../shared/runtime/maintenance-config-store.ts";
import { createMaintenanceController } from "../shared/runtime/maintenance-controller.ts";
import { codedError, errorCode } from "../shared/runtime/errors.ts";

const fields: Record<string, Record<string, string[]>> = {
  settings: {
    status: [],
    "set-exclusions": ["excludedPaths", "expectedExcludedPaths"],
  },
  maintenance: {
    status: [],
    configure: ["mode", "intervalValue", "intervalUnit", "expectedMaintenance"],
    complete: [],
  },
};

export async function settingsRequest(root: string, operation: string, request: unknown, signal?: AbortSignal) {
  if (!isAbsolute(root) || !(await stat(root)).isDirectory()) {
    throw codedError("INVALID_ROOT", "Provide an existing absolute workspace directory");
  }
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw codedError("INVALID_REQUEST", "Provide a JSON request object");
  }
  const params = request as Record<string, unknown>;
  const allowed = typeof params.action === "string" && Object.hasOwn(fields, operation)
    && Object.hasOwn(fields[operation], params.action) ? fields[operation][params.action] : undefined;
  if (!allowed || Object.keys(params).some((key) => key !== "action" && !allowed.includes(key))) {
    throw codedError("INVALID_REQUEST", "Unknown operation, action, or request field");
  }
  signal?.throwIfAborted();
  const store = createMaintenanceConfigStore({ cwd: root });
  if (operation === "settings") {
    if (params.action === "status") return store.readSettings();
    return store.compareAndUpdatePrivacyExclusions(params.expectedExcludedPaths, params.excludedPaths, { signal });
  }
  const controller = createMaintenanceController({ store });
  if (params.action === "status") return controller.status();
  let result;
  if (params.action === "complete") {
    result = await controller.completeCycle({ signal });
  } else {
    const calculated = controller.preview({
      mode: params.mode ?? "nudge",
      intervalValue: params.intervalValue,
      intervalUnit: params.intervalUnit,
    });
    if (!calculated.ok) return calculated;
    result = await store.compareAndUpdateMaintenance(params.expectedMaintenance, calculated.maintenance, { signal });
  }
  // Store mutation results can contain opaque config; only project maintenance fields.
  return {
    ok: result.ok, changed: result.changed, committed: result.committed,
    conflict: result.conflict, code: result.code, warning: result.warning,
    message: result.message, maintenance: result.maintenance,
  };
}

async function main() {
  const [flag, root, operation, ...extra] = process.argv.slice(2);
  if (flag !== "--root" || !root || !operation || extra.length) {
    throw codedError("INVALID_ARGUMENTS", "Usage: node settings.ts --root /absolute/workspace settings|maintenance < request.json");
  }
  if (Number(process.versions.node.split(".")[0]) < 24) {
    throw codedError("NODE_VERSION", "The PiCM settings helper requires Node 24 or newer");
  }
  const controller = new AbortController();
  const cancel = () => controller.abort(codedError("CONFIG_OPERATION_CANCELLED", "Cancellation requested; committed changes are retained"));
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  try {
    let input = "";
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) {
      input += chunk.toString();
      if (Buffer.byteLength(input) > 65536) throw codedError("INVALID_REQUEST", "Request exceeds 64 KiB");
    }
    let request: unknown;
    try { request = JSON.parse(input); } catch {
      throw codedError("INVALID_REQUEST", "Provide valid JSON on stdin");
    }
    const result = await settingsRequest(root, operation, request, controller.signal);
    console.log(JSON.stringify(result));
    process.exitCode = !result.ok ? 1 : "conflict" in result && result.conflict ? 2 : 0;
  } finally {
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    await main();
  } catch (error) {
    console.log(JSON.stringify({ ok: false, code: errorCode(error) ?? "HELPER_FAILED", message: "Settings operation failed; inspect the code and projected status before retrying" }));
    process.exitCode = 1;
  }
}
