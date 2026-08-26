function section(markdown, headings) {
  const escaped = headings.map((heading) => heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const match = markdown.match(new RegExp(`^#{1,6}\\s+(?:${escaped})\\s*$\\n([\\s\\S]*?)(?=^#{1,6}\\s+|(?![\\s\\S]))`, "im"));
  return match?.[1]?.trim() ?? "";
}

export function parseSpecialistFirstRunRecipe(recipePath, recipe) {
  if (typeof recipePath !== "string" || !recipePath.trim() || typeof recipe !== "string" || !recipe.trim()) {
    throw new Error("SPECIALIST_RECIPE_INCOMPLETE: approved recipe path and content are required");
  }
  if (/\{\{|\}\}|\[[A-Z][^\]]*\]|\b(?:TODO|TBD)\b/i.test(recipe)) {
    throw new Error("SPECIALIST_RECIPE_UNFINISHED: approved recipe contains unresolved template markers");
  }
  const inputsSection = section(recipe, ["Inputs", "Sources", "What it reads"]);
  const artifactSection = section(recipe, ["Expected artifact", "Output", "Expected output", "Result"]);
  const reviewSection = section(recipe, ["Review gate and next action", "Review gate", "Review and next action", "Approval and handoff"]);
  const inputs = inputsSection
    .split(/\n+/)
    .flatMap((line) => line.replace(/^[-*]\s+/, "").split(/(?<=[.!?])\s+/))
    .map((value) => value.trim())
    .filter(Boolean);
  const expectedArtifact = artifactSection.match(/`([^`]+)`/)?.[1];
  const requiresInspectEditApprove = /\binspect\b/i.test(reviewSection) && /\bedit\b/i.test(reviewSection) && /\bapprove\b/i.test(reviewSection);
  const nextActionSource = reviewSection.match(/\bnext\b[^.]*?\b(?:reads? from|uses?|consumes?)\b[^`]*`([^`]+)`/i)?.[1];
  const visibleUncertainty = [...reviewSection.matchAll(/\b(?:Keep|Leave|Preserve|Flag)\s+([^.!?\n]+)/gi)]
    .flatMap((match) => match[1].split(/\s+and\s+|,\s*/))
    .map((value) => value.replace(/\s+(?:visible(?:\s+there)?|in (?:the )?review notes)$/i, "").trim())
    .filter(Boolean);
  const semantics = { recipePath, inputs, expectedArtifact, requiresInspectEditApprove, nextActionSource, visibleUncertainty };
  renderSpecialistFirstRunGuidance(semantics);
  return semantics;
}

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
