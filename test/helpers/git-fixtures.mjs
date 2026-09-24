import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

export function write(path, content = "fixture\n") {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}

export function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "picm-gate-test-"));
  git(root, "init", "-q");
  write(
    join(root, ".gitignore"),
    [".env", ".env.*", "secrets/", "*.pem", ".pi/npm/", ""].join("\n"),
  );
  write(join(root, "safe.txt"), "safe\n");
  write(join(root, "docs", "guide.md"), "guide\n");
  write(join(root, "safe-dir", "file.txt"), "safe nested\n");
  write(join(root, ".env"), "SYNTHETIC_ONLY=ignored\n");
  write(join(root, ".env.tracked"), "SYNTHETIC_TRACKED=ignored\n");
  write(join(root, "secrets", "key.txt"), "synthetic ignored\n");
  git(root, "add", ".gitignore", "safe.txt", "docs/guide.md", "safe-dir/file.txt");
  git(root, "add", "-f", ".env.tracked");

  const packageRoot = join(
    root,
    ".pi",
    "npm",
    "node_modules",
    "@eyevanovich",
    "picm-factory",
  );
  write(join(packageRoot, "skills", "picm-factory", "SKILL.md"), "---\nname: picm-factory\n---\n");
  write(join(packageRoot, "skills", "picm-factory", "references", "guide.md"));
  write(join(dirname(packageRoot), "neighbor", "README.md"), "not trusted\n");

  if (process.platform !== "win32") {
    symlinkSync("safe.txt", join(root, "safe-link"));
    symlinkSync(".env", join(root, "ignored-target-link"));
    symlinkSync("safe-dir", join(root, "safe-dir-link"));
    symlinkSync(".env", join(root, "@safe.txt"));
  }

  return { root, packageRoot };
}

export async function withFixture(run) {
  const fixture = createFixture();
  try {
    await run(fixture);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
}
