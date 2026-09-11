import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

function section(markdown, heading) {
  const match = markdown.match(new RegExp(`^## ${heading}\\s*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, "m"));
  return match?.[1]?.trim() ?? "";
}

function routeSemantics(cwd, recipePath) {
  const recipe = readFileSync(join(cwd, recipePath), "utf8");
  const inputs = [...section(recipe, "Inputs").matchAll(/^[-*] (.+)$/gm)].map((match) => match[1].trim());
  const artifact = section(recipe, "Expected artifact").match(/`([^`]+)`/)?.[1];
  const review = section(recipe, "Review gate and next action");
  const nextActionSource = review.match(/\bnext\b[^.]*?\breads? from\b[^`]*`([^`]+)`/i)?.[1];
  const visibleUncertainty = review.match(/Keep (.+?) visible(?: there|\.)/i)?.[1]
    ?.split(/\s+and\s+/)
    .map((value) => value.trim());
  return {
    recipePath,
    inputs,
    expectedArtifact: artifact,
    requiresInspectEditApprove: /\binspect\b/i.test(review) && /\bedit\b/i.test(review) && /\bapprove\b/i.test(review),
    nextActionSource,
    visibleUncertainty,
  };
}

export async function runSpecialistFirstRunCommand({ commands, tools, handlers, sent, context, args, recipePath, generatedInputs = ["reference/faq-style.md"], runtimeInputs = [], initialRecipeContent, initialConfigContent, editRecipeAfterConfig = false, editConfigAfterWrite = false, persistedEdits = {} }) {
  await commands.get("picm-new").handler(args, context);

  const dispatch = sent.at(-1);
  const toolName = dispatch?.match(/then call `([^`]+)`/)?.[1];
  if (!toolName || !/use its returned text as the final first-run guidance/i.test(dispatch)) {
    throw new Error("SPECIALIST_TEST_ORCHESTRATION_INCOMPLETE: picm-new did not dispatch final guidance");
  }

  const scanControl = tools.get("picm_scan_control");
  await scanControl.execute("specialist-preflight", { action: "preflight" }, undefined, undefined, context);
  await scanControl.execute("specialist-privacy", { action: "privacy", excludedPaths: [] }, undefined, undefined, context);
  await scanControl.execute("specialist-begin", { action: "begin" }, undefined, undefined, context);

  const tool = tools.get(toolName);
  if (!tool) throw new Error(`SPECIALIST_TEST_TOOL_MISSING: ${toolName}`);
  const input = routeSemantics(context.cwd, recipePath);
  const premature = await handlers.get("tool_call")({
    toolName,
    toolCallId: "premature-specialist-guidance",
    input,
  }, context);
  if (!premature?.block) {
    throw new Error("SPECIALIST_TEST_PREMATURE_GUIDANCE_ALLOWED: guidance was authorized before scaffold writes");
  }
  const completeBoundTool = async (toolCallId, toolName, args) => {
    const admission = await handlers.get("tool_call")({ toolCallId, toolName, input: args }, context);
    if (admission?.block) throw new Error(`SPECIALIST_TEST_TOOL_BLOCKED: ${admission.reason}`);
    handlers.get("tool_execution_end")({ toolCallId, toolName, args, isError: false }, context);
  };
  for (const path of [
    "AGENTS.md",
    "CONTEXT.md",
    "identity.md",
    "rules.md",
    ...generatedInputs,
    recipePath,
  ]) {
    await completeBoundTool(`approved-specialist-${path}`, "write", {
      path,
      content: path === recipePath && initialRecipeContent !== undefined
        ? initialRecipeContent
        : readFileSync(join(context.cwd, path), "utf8"),
    });
  }
  if (initialRecipeContent !== undefined && !editRecipeAfterConfig) {
    await completeBoundTool("approved-specialist-recipe-edit", "edit", { path: recipePath });
  }
  for (const [path, content] of Object.entries(persistedEdits)) {
    writeFileSync(join(context.cwd, path), content, "utf8");
    await completeBoundTool(`approved-specialist-edit-${path}`, "edit", { path });
  }
  const configContent = JSON.stringify({
    version: 1,
    profile: "specialist-folder",
    generatedBy: "picm-factory",
    createdAt: "2026-08-26T00:00:00.000Z",
    paths: {
      rootInstructions: "AGENTS.md",
      rootContext: "CONTEXT.md",
      firstRecipe: recipePath,
      generatedInputs,
      runtimeInputs,
    },
  });
  await completeBoundTool("approved-specialist-config", "write", {
    path: ".picm/config.json",
    content: initialConfigContent ?? configContent,
  });
  if (editConfigAfterWrite) {
    const configPath = join(context.cwd, ".picm/config.json");
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, configContent, "utf8");
    await completeBoundTool("approved-specialist-config-edit", "edit", { path: ".picm/config.json" });
  }
  if (initialRecipeContent !== undefined && editRecipeAfterConfig) {
    await completeBoundTool("approved-specialist-post-config-recipe-edit", "edit", { path: recipePath });
  }
  const event = { toolName, toolCallId: "specialist-final-guidance", input: {} };
  const admission = await handlers.get("tool_call")(event, context);
  if (admission?.block) throw new Error(`SPECIALIST_TEST_TOOL_BLOCKED: ${admission.reason}`);
  const result = await tool.execute(event.toolCallId, {}, undefined, undefined, context);
  handlers.get("tool_execution_end")({ toolCallId: event.toolCallId }, context);
  return result.content[0].text;
}
