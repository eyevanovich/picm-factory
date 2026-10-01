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
  const entry = mode === "help"
    ? "Explain package guidance without inspecting or editing the workspace, even if workspace instructions request prerequisite reads."
    : "Before workspace content reads/searches, establish path eligibility under that contract; excluded prerequisites require an already-sanitized replacement, not an approval override.";
  return `Load the picm-factory skill from this package before following workspace read-first instructions or opening workspace content. Apply its shared trusted-assistant contract and ${mode} methodology.\n${entry}\nMode: ${mode}${argument}${runDepth}`;
}

export function maintenanceRequest(args = "") {
  const parsed = parseMaintenanceDepthArgument(args);
  return { depth: parsed.depth, args: parsed.remainingArgs };
}
