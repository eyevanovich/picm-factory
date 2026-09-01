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

export async function runSpecialistFirstRunCommand({ commands, tools, handlers, sent, context, args, recipePath, generatedInputs = ["reference/faq-style.md"], runtimeInputs = [], initialRecipeContent, editRecipeAfterConfig = false, editConfigAfterWrite = false, persistedEdits = {} }) {
  await commands.get("picm-new").handler(args, context);

  const dispatch = sent.at(-1);
  const toolName = dispatch?.match(/then call `([^`]+)`/)?.[1];
  if (!toolName || !dispatch.includes("use its returned text as the final first-run guidance")) {
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
  for (const path of [
    "AGENTS.md",
    "CONTEXT.md",
    "identity.md",
    "rules.md",
    ...generatedInputs,
    recipePath,
  ]) {
    handlers.get("tool_execution_end")({
      toolCallId: `approved-specialist-${path}`,
      toolName: "write",
      args: {
        path,
        content: path === recipePath && initialRecipeContent !== undefined
          ? initialRecipeContent
          : readFileSync(join(context.cwd, path), "utf8"),
      },
      isError: false,
    }, context);
  }
  if (initialRecipeContent !== undefined && !editRecipeAfterConfig) {
    handlers.get("tool_execution_end")({
      toolCallId: "approved-specialist-recipe-edit",
      toolName: "edit",
      args: { path: recipePath },
      isError: false,
    }, context);
  }
  for (const [path, content] of Object.entries(persistedEdits)) {
    writeFileSync(join(context.cwd, path), content, "utf8");
    handlers.get("tool_execution_end")({
      toolCallId: `approved-specialist-edit-${path}`,
      toolName: "edit",
      args: { path },
      isError: false,
    }, context);
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
  handlers.get("tool_execution_end")({
    toolCallId: "approved-specialist-config",
    toolName: "write",
    args: {
      path: ".picm/config.json",
      content: configContent,
    },
    isError: false,
  }, context);
  if (editConfigAfterWrite) {
    const configPath = join(context.cwd, ".picm/config.json");
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, configContent, "utf8");
    handlers.get("tool_execution_end")({
      toolCallId: "approved-specialist-config-edit",
      toolName: "edit",
      args: { path: ".picm/config.json" },
      isError: false,
    }, context);
  }
  if (initialRecipeContent !== undefined && editRecipeAfterConfig) {
    handlers.get("tool_execution_end")({
      toolCallId: "approved-specialist-post-config-recipe-edit",
      toolName: "edit",
      args: { path: recipePath },
      isError: false,
    }, context);
  }
  const event = { toolName, toolCallId: "specialist-final-guidance", input: {} };
  const admission = await handlers.get("tool_call")(event, context);
  if (admission?.block) throw new Error(`SPECIALIST_TEST_TOOL_BLOCKED: ${admission.reason}`);
  const result = await tool.execute(event.toolCallId, {}, undefined, undefined, context);
  handlers.get("tool_execution_end")({ toolCallId: event.toolCallId }, context);
  return result.content[0].text;
}
