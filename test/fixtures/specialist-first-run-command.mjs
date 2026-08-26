export async function runSpecialistFirstRunCommand({ commands, tools, sent, context, args, routeSemantics }) {
  await commands.get("picm-new").handler(args, context);

  const dispatch = sent.at(-1);
  const toolName = dispatch?.match(/call `([^`]+)` with the exact route semantics from the approved recipe/)?.[1];
  if (!toolName || !dispatch.includes("use its returned text as the final first-run guidance")) {
    throw new Error("SPECIALIST_TEST_ORCHESTRATION_INCOMPLETE: picm-new did not dispatch final guidance");
  }

  const tool = tools.get(toolName);
  if (!tool) throw new Error(`SPECIALIST_TEST_TOOL_MISSING: ${toolName}`);
  const result = await tool.execute(
    "specialist-final-guidance",
    routeSemantics,
    undefined,
    undefined,
    context,
  );
  return result.content[0].text;
}
