import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type CommandName = "picm-new" | "picm-adopt" | "picm-maintain" | "picm-help";

const commandDescriptions: Record<CommandName, string> = {
  "picm-new": "Create a new PiCM folder-agent workspace through an interview-led setup flow",
  "picm-adopt": "Adopt an existing workflow or coding repository non-invasively",
  "picm-maintain": "Check workflow and coding-context health using the maintenance rubric",
  "picm-help": "Show PiCM Factory setup and command guidance",
};

const adoptArgumentCompletions = [
  {
    value: "coding",
    label: "coding — adopt as a Coding Repository or add codebase mapping",
  },
];

const maintainArgumentCompletions = [
  { value: "coding", label: "coding — check repository context-map drift" },
  {
    value: 'trace "final output drifted from approved source"',
    label: 'trace "drift symptom"',
  },
  {
    value: 'trace "handoffs are losing uncertainty"',
    label: 'trace "handoff symptom"',
  },
  {
    value: 'trace "stage output no longer matches prior decisions"',
    label: 'trace "stage alignment symptom"',
  },
  { value: "routing", label: "routing" },
  { value: "handoffs", label: "handoffs" },
  { value: "stale-context", label: "stale-context" },
  { value: "security", label: "security" },
];

function buildPrompt(command: CommandName, args: string): string {
  const mode = command.replace("picm-", "");
  const argText = args.trim() ? `\n\nUser arguments:\n${args.trim()}` : "";

  return `Use the picm-factory skill. Load its SKILL.md before proceeding.\n\nMode: ${mode}\nCommand: /${command}${argText}`;
}

export default function picmFactoryExtension(pi: ExtensionAPI) {
  for (const command of Object.keys(commandDescriptions) as CommandName[]) {
    pi.registerCommand(command, {
      description: commandDescriptions[command],
      ...(command === "picm-adopt" || command === "picm-maintain"
        ? {
            getArgumentCompletions: (prefix: string) => {
              const normalizedPrefix = prefix.trimStart().toLowerCase();
              const items =
                command === "picm-adopt"
                  ? adoptArgumentCompletions
                  : maintainArgumentCompletions;
              const completions = items.filter((item) =>
                item.value.toLowerCase().startsWith(normalizedPrefix),
              );

              return completions.length > 0 ? completions : null;
            },
          }
        : {}),
      handler: async (args, ctx) => {
        await ctx.waitForIdle();
        pi.sendUserMessage(buildPrompt(command, args));
      },
    });
  }
}
