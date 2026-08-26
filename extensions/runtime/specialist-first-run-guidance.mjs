export function renderSpecialistFirstRunGuidance({
  recipePath,
  inputs,
  expectedArtifact,
  requiresInspectEditApprove,
  nextActionSource,
  visibleUncertainty,
}) {
  const requiredStrings = [recipePath, expectedArtifact, nextActionSource];
  if (requiredStrings.some((value) => typeof value !== "string" || !value.trim())) {
    throw new Error("SPECIALIST_GUIDANCE_INVALID: recipe path, expected artifact, and next-action source are required");
  }
  if (!Array.isArray(inputs) || inputs.length === 0 || inputs.some((value) => typeof value !== "string" || !value.trim())) {
    throw new Error("SPECIALIST_GUIDANCE_INVALID: at least one named input is required");
  }
  if (!Array.isArray(visibleUncertainty) || visibleUncertainty.length === 0 || visibleUncertainty.some((value) => typeof value !== "string" || !value.trim())) {
    throw new Error("SPECIALIST_GUIDANCE_INVALID: at least one visible uncertainty category is required");
  }
  if (requiresInspectEditApprove !== true) {
    throw new Error("SPECIALIST_GUIDANCE_INVALID: the approved recipe must require inspect, edit, and approve");
  }

  return [
    `Start with \`${recipePath}\`.`,
    `Inputs: ${inputs.join("; ")}`,
    `Expected artifact: \`${expectedArtifact}\`.`,
    `Inspect, edit, and explicitly approve \`${expectedArtifact}\` before another specialist action. Keep ${visibleUncertainty.join(" and ")} visible.`,
    `The next specialist action reads from the approved \`${nextActionSource}\`, not chat memory.`,
    "Run `/picm-maintain` after the first real use or when the specialist workflow, routing, or stable guidance changes.",
  ].join("\n");
}
