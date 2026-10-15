import { composeModeInstructions } from "../../../shared/compose-instructions.ts";
import { parseMaintenanceDepthArgument } from "../../../shared/runtime/coding-maintenance-depth.ts";

import type { MaintenanceDepth } from "../../../shared/runtime/coding-maintenance-depth.ts";

const modes = new Map([
  ["picm-new", "new"],
  ["picm-adopt", "adopt"],
  ["picm-maintain", "maintain"],
  ["picm-optimize", "optimize"],
  ["picm-help", "help"],
]);

export function commandPrompt(command: string, args = "", { depth }: { depth?: MaintenanceDepth } = {}) {
  const mode = modes.get(command);
  if (!mode) throw new Error(`Unknown PiCM command: ${command}`);
  const text = args.trim();
  const argument = text ? `\nUser arguments: ${text}` : "";
  const runDepth = command === "picm-maintain" ? `\nOne-run depth: ${depth ?? "strict"}. Do not change stored maintenancePreset.` : "";
  return `${composeModeInstructions({ mode, hostFile: "pi/HOST.md" })}${argument}${runDepth}`;
}

export function maintenanceRequest(args = "") {
  const parsed = parseMaintenanceDepthArgument(args);
  return { depth: parsed.depth, args: parsed.remainingArgs };
}
