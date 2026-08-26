import { readFileSync } from "node:fs";
import { join } from "node:path";

export async function runSpecialistFirstRunCommand({ commands, tools, sent, context, args, recipePath }) {
  await commands.get("picm-new").handler(args, context);

  const dispatch = sent.at(-1);
  const toolName = dispatch?.match(/call `([^`]+)` with the exact first recipe path and approved recipe content/)?.[1];
  if (!toolName || !dispatch.includes("use its returned text as the final first-run guidance")) {
    throw new Error("SPECIALIST_TEST_ORCHESTRATION_INCOMPLETE: picm-new did not dispatch final guidance");
  }

  const tool = tools.get(toolName);
  if (!tool) throw new Error(`SPECIALIST_TEST_TOOL_MISSING: ${toolName}`);
  const recipe = readFileSync(join(context.cwd, recipePath), "utf8");
  const result = await tool.execute(
    "specialist-final-guidance",
    { recipePath, recipe },
    undefined,
    undefined,
    context,
  );
  return result.content[0].text;
}
