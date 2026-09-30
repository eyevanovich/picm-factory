import { parseMaintenanceDepthArgument } from "./coding-maintenance-depth.mjs";

const modes = new Map([
  ["picm-new", "new"],
  ["picm-adopt", "adopt"],
  ["picm-maintain", "maintain"],
  ["picm-optimize", "optimize"],
  ["picm-help", "help"],
]);

export function commandPrompt(command, args = "", { depth } = {}) {
  const mode = modes.get(command);
  if (!mode) throw new Error(`Unknown PiCM command: ${command}`);
  const text = args.trim();
  const argument = text ? `\nUser arguments: ${text}` : "";
  const runDepth = command === "picm-maintain" ? `\nOne-run depth: ${depth ?? "strict"}. Do not change stored maintenancePreset.` : "";
  return `Load the picm-factory skill from this package and follow its shared trusted-assistant contract and ${mode} methodology.\nMode: ${mode}${argument}${runDepth}`;
}

export function maintenanceRequest(args = "") {
  const parsed = parseMaintenanceDepthArgument(args);
  return { depth: parsed.depth, args: parsed.remainingArgs };
}
