import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const nativeGit = realpathSync(execFileSync("which", ["git"], { encoding: "utf8" }).trim());
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

export function namedReadFixture(t) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), "picm-named-read-")));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = join(base, "workspace");
  const home = join(base, "home");
  const bin = join(base, "bin");
  for (const directory of [root, home, bin, join(home, ".config/git")]) mkdirSync(directory, { recursive: true });
  const system = join(base, "system.config");
  writeFileSync(system, "");
  // Fixture-owned launcher isolates the native system source without touching host configuration.
  const launcher = join(bin, "git");
  const launcherText = `#!/bin/sh\nexport GIT_CONFIG_SYSTEM=${quote(system)}\nexec ${quote(nativeGit)} "$@"\n`;
  writeFileSync(launcher, launcherText);
  chmodSync(launcher, 0o755);
  const env = { PATH: `${bin}:${dirname(nativeGit)}:/usr/bin:/bin`, HOME: home, XDG_CONFIG_HOME: join(home, ".config") };
  function git(...args) { return execFileSync(launcher, args, { cwd: root, env, encoding: "utf8" }); }
  git("init", "-q");
  function put(path, content = "# Synthetic document\n") {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
    return join(root, path);
  }
  put("guide.md");
  function useEnvironment() {
    const previous = process.env;
    process.env = { ...env };
    t.after(() => { process.env = previous; });
  }
  return { base, root, home, system, bin, launcher, launcherText, env, git, put, useEnvironment };
}
