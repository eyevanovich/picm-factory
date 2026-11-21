import { readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { commandPrompt } from "../pi/extensions/runtime/command-dispatch.ts";
import { MODE_GUIDES } from "../shared/compose-instructions.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function instructionSize(text) {
  return {
    lines: text ? text.split("\n").length - Number(text.endsWith("\n")) : 0,
    words: text.match(/\S+/gu)?.length ?? 0,
    bytes: Buffer.byteLength(text, "utf8"),
  };
}

export function instructionSizeReport(bundle = join(root, "dist/claude-code")) {
  return Object.keys(MODE_GUIDES).flatMap((mode) => [
    {
      host: "Pi",
      mode,
      payload: mode === "maintain" ? "prompt, strict depth" : "prompt",
      ...instructionSize(commandPrompt(`picm-${mode}`)),
    },
    {
      host: "Claude Code",
      mode,
      payload: "full SKILL.md",
      ...instructionSize(readFileSync(join(bundle, `skills/${mode}/SKILL.md`), "utf8")),
    },
  ]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    console.log("Empty-argument Pi prompts and generated Claude skill files (including frontmatter).");
    console.log("Words are whitespace-separated; bytes are UTF-8, not tokens. Pi link sizes depend on the install path.");
    console.table(instructionSizeReport());
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
