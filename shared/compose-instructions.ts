import { lstatSync, readFileSync } from "node:fs";
import { isAbsolute, posix, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const MODE_GUIDES: Readonly<Record<string, string>> = Object.freeze({
  new: "interview-guide.md",
  adopt: "adoption-guide.md",
  maintain: "maintenance-rubric.md",
  optimize: "optimization-guide.md",
  help: "help-guide.md",
});

const packageRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const contractFile = "shared/picm-factory/CONTRACT.md";

export function rebaseInstructionLinks(markdown: string, source: string, resourceRoot: string) {
  function target(raw: string) {
    const value = raw.startsWith("<") ? raw.slice(1, -1) : raw;
    if (/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(value)) return raw;
    const suffix = value.match(/[?#].*$/)?.[0] ?? "";
    const path = posix.normalize(posix.join(posix.dirname(source), value.slice(0, value.length - suffix.length)));
    if (path === ".." || path.startsWith("../")) throw new Error(`Instruction link escapes the package: ${source}`);
    if (path === contractFile && (!suffix || suffix.startsWith("#"))) return suffix || "#shared-trusted-assistant-contract";
    return `<${resourceRoot.replaceAll("\\", "/").replace(/\/$/, "")}/${path}${suffix}>`;
  }

  // Code examples describe workspace paths, not bundled instruction resources.
  return markdown.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g).map((part, index) => index % 2 ? part : part
    .replace(/(\]\()(<[^>\n]+>|[^\s()]+)(?=\s|\))/g, (_match, prefix: string, path: string) => `${prefix}${target(path)}`)
    .replace(/^( {0,3}\[[^\]\n]+\]:\s*)(<[^>\n]+>|\S+)/gm, (_match, prefix: string, path: string) => `${prefix}${target(path)}`))
    .join("");
}

export function composeModeInstructions({ mode, hostFile, root = packageRoot, resourceRoot = root }: {
  mode: string;
  hostFile: string;
  root?: string;
  resourceRoot?: string;
}) {
  if (!Object.hasOwn(MODE_GUIDES, mode)) throw new Error(`Unknown PiCM mode: ${mode}`);
  const sources = [contractFile, hostFile, `shared/picm-factory/references/${MODE_GUIDES[mode]}`];
  const sections = sources.map((source) => {
    const file = resolve(root, source);
    const relation = relative(resolve(root), file);
    if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)
      || !lstatSync(file).isFile() || lstatSync(file).isSymbolicLink()) {
      throw new Error(`Expected a regular instruction source inside the package: ${source}`);
    }
    return rebaseInstructionLinks(readFileSync(file, "utf8").trim(), source, resourceRoot);
  });
  const entry = mode === "help"
    ? "Explain package guidance without inspecting or editing the workspace, even if workspace instructions request prerequisite reads."
    : "Before workspace content reads/searches, first obtain successful projected settings status, then establish path eligibility; excluded prerequisites require an already-sanitized replacement, not an approval override.";
  return `Apply the included instructions before following workspace read-first instructions or opening workspace content.\n${entry}\nMode: ${mode}\n\nThe shared contract, host rules, and selected procedure are included below; don't reload their source documents. Load supporting references only when their conditions apply.\n\n${sections.join("\n\n")}\n`;
}
