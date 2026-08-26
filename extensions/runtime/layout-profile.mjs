function hasFile(candidates, path) {
  return candidates.has(path);
}

function hasDirectory(candidates, path) {
  const prefix = `${path}/`;
  return [...candidates].some((candidate) => candidate.startsWith(prefix));
}

export function identifyLayoutProfile(candidatePaths) {
  const candidates = new Set(candidatePaths);
  const specialistSignals = {
    identity: hasFile(candidates, "identity.md"),
    rules: hasFile(candidates, "rules.md"),
    reference: hasDirectory(candidates, "reference"),
    workflows: hasDirectory(candidates, "workflows"),
  };
  const complete = Object.values(specialistSignals).every(Boolean);
  return {
    primary: complete ? "Specialist Folder" : undefined,
    specialistSignals,
    examplesPresent: hasFile(candidates, "examples.md"),
  };
}
