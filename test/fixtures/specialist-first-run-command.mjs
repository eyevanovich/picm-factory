import { readFileSync } from "node:fs";
import { join } from "node:path";

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

export async function runSpecialistFirstRunCommand({ commands, tools, handlers, sent, context, args, recipePath }) {
  await commands.get("picm-new").handler(args, context);

  const dispatch = sent.at(-1);
  const toolName = dispatch?.match(/call `([^`]+)` with the exact route semantics from the approved recipe/)?.[1];
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
  const event = { toolName, toolCallId: "specialist-final-guidance", input };
  const admission = await handlers.get("tool_call")(event, context);
  if (admission?.block) throw new Error(`SPECIALIST_TEST_TOOL_BLOCKED: ${admission.reason}`);
  const result = await tool.execute(event.toolCallId, input, undefined, undefined, context);
  handlers.get("tool_execution_end")({ toolCallId: event.toolCallId }, context);
  return result.content[0].text;
}
