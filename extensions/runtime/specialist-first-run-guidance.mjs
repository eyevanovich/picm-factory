const RECEIPT_LANGUAGE = "picm-specialist-first-run";
const RECEIPT_OPENING = "```picm-specialist-first-run";
const RECEIPT_CLOSING = "```";
const RECEIPT_VERSION = 1;
const INPUT_AVAILABILITY = new Set(["scaffolded", "pre-existing", "per-run"]);

function receiptError(message) {
  throw new Error(`SPECIALIST_RECIPE_RECEIPT_INVALID: ${message}`);
}

function guidanceError(message) {
  throw new Error(`SPECIALIST_GUIDANCE_INVALID: ${message}`);
}

function hasOnlyKeys(value, keys) {
  return Object.keys(value).every((key) => keys.includes(key)) &&
    keys.every((key) => Object.hasOwn(value, key));
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonemptyString(value) {
  return typeof value === "string" && value.trim() === value && value.length > 0;
}

export function isLocalSpecialistRoute(value) {
  if (!isNonemptyString(value) || value.includes("\\") || /^(?:\/|[A-Za-z]:)/.test(value)) return false;
  return value.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function hasUnresolvedMarker(content) {
  return typeof content === "string" && content.includes("{{picm:");
}

export function hasUnresolvedSpecialistPlaceholder(content) {
  return hasUnresolvedMarker(content);
}

function receiptBlock(recipe) {
  const lines = recipe.split(/\r?\n/);
  const firstContent = lines.findIndex((line) => !/^[ \t]*$/.test(line));
  if (firstContent === -1 || lines[firstContent] !== RECEIPT_OPENING) {
    receiptError(`receipt must be the first nonblank content as ${RECEIPT_OPENING}`);
  }
  if (lines.filter((line) => line === RECEIPT_OPENING).length !== 1) {
    receiptError(`exactly one ${RECEIPT_LANGUAGE} receipt opening is required`);
  }
  const closing = lines.indexOf(RECEIPT_CLOSING, firstContent + 1);
  if (closing === -1) {
    receiptError(`receipt must end with an exact ${RECEIPT_CLOSING} closing line`);
  }
  return lines.slice(firstContent + 1, closing).join("\n");
}

function validateReceipt(receipt, fail) {
  if (!isRecord(receipt) || !hasOnlyKeys(receipt, ["version", "inputs", "expectedArtifact", "review", "nextAction"])) {
    fail("receipt must contain only version, inputs, expectedArtifact, review, and nextAction");
  }
  if (receipt.version !== RECEIPT_VERSION) fail(`version must be ${RECEIPT_VERSION}`);
  if (!Array.isArray(receipt.inputs) || receipt.inputs.length === 0) fail("inputs must be a nonempty array");
  if (!isNonemptyString(receipt.expectedArtifact) || !isLocalSpecialistRoute(receipt.expectedArtifact)) {
    fail("expectedArtifact must be a nonempty local route");
  }
  if (!isRecord(receipt.review) || !hasOnlyKeys(receipt.review, ["requiresInspectEditApprove", "visibleUncertainty"])) {
    fail("review must contain only requiresInspectEditApprove and visibleUncertainty");
  }
  if (receipt.review.requiresInspectEditApprove !== true) {
    fail("review.requiresInspectEditApprove must be true");
  }
  if (
    !Array.isArray(receipt.review.visibleUncertainty) ||
    receipt.review.visibleUncertainty.length === 0 ||
    receipt.review.visibleUncertainty.some((value) => !isNonemptyString(value))
  ) {
    fail("review.visibleUncertainty must be a nonempty string array");
  }
  if (!isRecord(receipt.nextAction) || !hasOnlyKeys(receipt.nextAction, ["source"])) {
    fail("nextAction must contain only source");
  }
  if (!isNonemptyString(receipt.nextAction.source) || !isLocalSpecialistRoute(receipt.nextAction.source)) {
    fail("nextAction.source must be a nonempty local route");
  }
  if (receipt.nextAction.source !== receipt.expectedArtifact) {
    fail("nextAction.source must equal expectedArtifact");
  }
  const inputPaths = new Set();
  for (const input of receipt.inputs) {
    if (!isRecord(input) || !hasOnlyKeys(input, ["path", "availability", "description"])) {
      fail("each input must contain only path, availability, and description");
    }
    if (!isNonemptyString(input.path) || !isLocalSpecialistRoute(input.path)) {
      fail("each input path must be a nonempty local route");
    }
    if (!INPUT_AVAILABILITY.has(input.availability)) {
      fail("each input availability must be scaffolded, pre-existing, or per-run");
    }
    if (!isNonemptyString(input.description)) {
      fail("each input description must be a nonempty string");
    }
    if (inputPaths.has(input.path)) fail("input routes must be unique");
    inputPaths.add(input.path);
  }
  const routes = [receipt.expectedArtifact, receipt.nextAction.source, ...inputPaths];
  const descriptions = [...receipt.inputs.map((input) => input.description), ...receipt.review.visibleUncertainty];
  if (routes.some(hasUnresolvedMarker) || descriptions.some(hasUnresolvedSpecialistPlaceholder)) {
    fail("receipt fields must not contain unresolved template markers");
  }
}

function parsedReceipt(recipe) {
  const block = receiptBlock(recipe);
  let receipt;
  try {
    receipt = JSON.parse(block);
  } catch {
    receiptError("receipt must contain valid JSON");
  }
  validateReceipt(receipt, receiptError);
  return receipt;
}

export function parseSpecialistFirstRunRecipe(recipePath, recipe) {
  if (!isNonemptyString(recipePath) || !isLocalSpecialistRoute(recipePath) || typeof recipe !== "string" || !recipe.trim()) {
    throw new Error("SPECIALIST_RECIPE_INCOMPLETE: approved recipe path and content are required");
  }
  if (hasUnresolvedMarker(recipePath) || hasUnresolvedSpecialistPlaceholder(recipe)) {
    throw new Error("SPECIALIST_RECIPE_UNFINISHED: approved recipe contains unresolved template markers");
  }
  const receipt = parsedReceipt(recipe);
  const semantics = {
    recipePath,
    version: receipt.version,
    inputs: receipt.inputs.map((input) => ({ ...input })),
    inputPaths: receipt.inputs.map((input) => input.path),
    expectedArtifact: receipt.expectedArtifact,
    review: {
      requiresInspectEditApprove: receipt.review.requiresInspectEditApprove,
      visibleUncertainty: [...receipt.review.visibleUncertainty],
    },
    requiresInspectEditApprove: receipt.review.requiresInspectEditApprove,
    nextAction: { source: receipt.nextAction.source },
    nextActionSource: receipt.nextAction.source,
    visibleUncertainty: [...receipt.review.visibleUncertainty],
  };
  renderSpecialistFirstRunGuidance(semantics);
  return semantics;
}

export function renderSpecialistFirstRunGuidance({
  recipePath,
  version = RECEIPT_VERSION,
  inputs,
  expectedArtifact,
  review,
  requiresInspectEditApprove,
  nextAction,
  nextActionSource,
  visibleUncertainty,
}) {
  const normalizedReview = review ?? {
    requiresInspectEditApprove,
    visibleUncertainty,
  };
  const normalizedNextAction = nextAction ?? { source: nextActionSource };
  const receipt = {
    version,
    inputs,
    expectedArtifact,
    review: normalizedReview,
    nextAction: normalizedNextAction,
  };
  validateReceipt(receipt, guidanceError);
  if (!isNonemptyString(recipePath) || !isLocalSpecialistRoute(recipePath) || hasUnresolvedMarker(recipePath)) {
    guidanceError("recipe path must be a nonempty local route without unresolved template markers");
  }

  return [
    `Start with \`${recipePath}\`.`,
    `Inputs: ${inputs.map((input) => `\`${input.path}\` (${input.availability}): ${input.description}`).join("; ")}`,
    `Expected artifact: \`${expectedArtifact}\`.`,
    `Inspect, edit, and explicitly approve \`${expectedArtifact}\` before another specialist action. Keep ${normalizedReview.visibleUncertainty.join(" and ")} visible.`,
    `The next specialist action reads from the approved \`${expectedArtifact}\`, not chat memory.`,
    "Run `/picm-maintain` after the first real use or when the specialist workflow, routing, or stable guidance changes.",
  ].join("\n");
}
