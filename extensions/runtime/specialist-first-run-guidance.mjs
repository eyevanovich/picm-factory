function section(markdown, heading) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(new RegExp(`^## ${escaped}\\s*\\n([\\s\\S]*?)(?=^## |\\s*$)`, "m"));
  return match?.[1]?.trim() ?? "";
}

export function renderSpecialistFirstRunGuidance({ recipePath, recipe }) {
  if (typeof recipePath !== "string" || !recipePath.trim()) {
    throw new Error("SPECIALIST_GUIDANCE_INVALID: recipePath is required");
  }
  if (typeof recipe !== "string" || !recipe.trim()) {
    throw new Error("SPECIALIST_GUIDANCE_INVALID: recipe content is required");
  }

  const inputsSection = section(recipe, "Inputs");
  const artifactSection = section(recipe, "Expected artifact");
  const reviewSection = section(recipe, "Review gate and next action");
  const inputs = [...inputsSection.matchAll(/^[-*] (.+)$/gm)].map((match) => match[1].trim());
  const artifact = artifactSection.match(/`([^`]+)`/)?.[1];
  const hasReviewGate = /\binspect\b/i.test(reviewSection) && /\bedit\b/i.test(reviewSection) && /\bapprove\b/i.test(reviewSection);
  const uncertainty = reviewSection.match(/Keep (.+?) visible(?: there|\.)/i)?.[1];
  const nextActionSource = reviewSection.match(/\bnext\b[^.]*?\breads? from\b[^`]*`([^`]+)`/i)?.[1];

  if (inputs.length === 0 || !artifact || !hasReviewGate || !uncertainty || !nextActionSource) {
    throw new Error("SPECIALIST_GUIDANCE_INCOMPLETE: approved recipe must name inputs, an artifact, an inspect/edit/approve gate, visible uncertainty, and the next-action source");
  }

  return [
    `Start with \`${recipePath}\`.`,
    `Inputs: ${inputs.join("; ")}`,
    `Expected artifact: \`${artifact}\`.`,
    `Inspect, edit, and explicitly approve \`${artifact}\` before another specialist action. Keep ${uncertainty} visible.`,
    `The next specialist action reads from the approved \`${nextActionSource}\`, not chat memory.`,
    "Run `/picm-maintain` after the first real use or when the specialist workflow, routing, or stable guidance changes.",
  ].join("\n");
}
