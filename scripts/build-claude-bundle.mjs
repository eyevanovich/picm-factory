import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { composeModeInstructions } from "../shared/compose-instructions.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function buildClaudeBundle({ root = repositoryRoot } = {}) {
  const dist = join(root, "dist");
  const destination = join(dist, "claude-code");
  if (existsSync(dist) && (!lstatSync(dist).isDirectory() || lstatSync(dist).isSymbolicLink())) {
    throw new Error("dist must be an ordinary directory");
  }
  mkdirSync(dist, { recursive: true });
  if (existsSync(destination)) {
    if (lstatSync(destination).isSymbolicLink()
      || !existsSync(join(destination, "package.json"))
      || JSON.parse(readFileSync(join(destination, "package.json"), "utf8")).picmGeneratedBundle !== true) {
      throw new Error("Refusing to replace a directory that isn't a generated PiCM bundle");
    }
  }
  const staging = mkdtempSync(join(dist, ".claude-code-"));
  try {
    function copy(source, target) {
      const path = join(root, source);
      if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink()) throw new Error(`Expected a regular source file: ${source}`);
      mkdirSync(dirname(join(staging, target)), { recursive: true });
      copyFileSync(path, join(staging, target));
    }
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const manifest = JSON.parse(readFileSync(join(root, "claude-code/.claude-plugin/plugin.json"), "utf8"));
    manifest.version = pkg.version;
    mkdirSync(join(staging, ".claude-plugin"));
    writeFileSync(join(staging, ".claude-plugin/plugin.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    writeFileSync(join(staging, "package.json"), `${JSON.stringify({
      name: "picm-claude-code", version: pkg.version, private: true, type: "module",
      engines: { node: ">=24" }, picmGeneratedBundle: true,
    }, null, 2)}\n`);
    copy("claude-code/README.md", "README.md");
    for (const mode of ["new", "adopt", "maintain", "optimize", "help"]) {
      const target = `skills/${mode}/SKILL.md`;
      copy(`claude-code/${target}`, target);
      const entry = readFileSync(join(staging, target), "utf8");
      const frontmatter = entry.match(/^---\n[\s\S]*?\n---\n/);
      if (!frontmatter) throw new Error(`Missing skill frontmatter: ${target}`);
      const instructions = composeModeInstructions({ mode, hostFile: "claude-code/HOST.md", root, resourceRoot: "${CLAUDE_PLUGIN_ROOT}" });
      writeFileSync(join(staging, target), `${frontmatter[0]}\n${instructions}\n${entry.slice(frontmatter[0].length).trim()}\n`);
    }
    copy("claude-code/settings.ts", "claude-code/settings.ts");
    copy("claude-code/session-history.md", "claude-code/session-history.md");
    copy("LICENSE", "LICENSE");
    copy("shared/picm-factory/CONTRACT.md", "shared/picm-factory/CONTRACT.md");
    for (const [directory, extension] of [
      ["shared/picm-factory/references", ".md"],
      ["shared/picm-factory/templates", ".md"],
      ["shared/runtime", ".ts"],
    ]) {
      for (const name of readdirSync(join(root, directory)).sort()) {
        if (!name.endsWith(extension)) throw new Error(`Unexpected bundle source: ${directory}/${name}`);
        copy(`${directory}/${name}`, `${directory}/${name}`);
      }
    }
    if (existsSync(destination)) rmSync(destination, { recursive: true });
    renameSync(staging, destination);
    return destination;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    console.log(buildClaudeBundle());
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
