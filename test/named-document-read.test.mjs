import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, chmodSync, linkSync, mkdirSync, readFileSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import fs from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { readNamedDocument } from "../shared/runtime/named-document-read.ts";
import { namedReadFixture } from "./helpers/named-read-fixture.mjs";

function fixture(t) {
  const f = namedReadFixture(t);
  f.useEnvironment();
  return f;
}

function watchCandidate(t, root, action) {
  const opened = [];
  const original = fs.open;
  t.mock.method(fs, "open", async (path, ...args) => {
    opened.push(path);
    const handle = await original(path, ...args);
    if (path === join(root, "guide.md") && action) await action(handle);
    return handle;
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  return opened;
}

function failure(result, code) {
  assert.equal(result.ok, false, JSON.stringify(result));
  if (code) assert.equal(result.code, code);
  assert.deepEqual(Object.keys(result).sort(), ["code", "message", "ok"]);
  assert.doesNotMatch(JSON.stringify(result), /CANDIDATE_MARKER|POLICY_MARKER|CONFIG_MARKER|opaque|fatal:|EACCES|ENOENT/);
}

test("reads one named UTF-8 Markdown file after all applicable policies, without returning policy/config values", async (t) => {
  const f = fixture(t);
  f.put("docs/guide.md", "# Guide\r\n資料\n");
  f.put(".gitignore", "# POLICY_MARKER\nother.md\n");
  f.put("docs/.gitignore", "# nested policy\n");
  f.put(".picm/config.json", JSON.stringify({ opaque: "CONFIG_MARKER", privacy: { excludedPaths: [], custom: "CONFIG_MARKER" } }));
  writeFileSync(join(f.home, ".config/git/ignore"), "# global policy\n");
  const opened = watchCandidate(t, f.root);
  const result = await readNamedDocument(f.root, { path: "docs/guide.md" });
  assert.deepEqual(result, { ok: true, path: "docs/guide.md", content: "# Guide\r\n資料\n", bytes: Buffer.byteLength("# Guide\r\n資料\n") });
  const candidate = opened.indexOf(join(f.root, "docs/guide.md"));
  for (const path of [".gitignore", "docs/.gitignore", ".git/info/exclude"]) {
    assert.ok(opened.indexOf(join(f.root, path)) < candidate, path);
    assert.ok(opened.includes(join(f.root, path)), path);
  }
  assert.ok(opened.indexOf(join(f.home, ".config/git/ignore")) < candidate);
});

test("absence is supported; parent .gitignore above the Git root is not applicable", async (t) => {
  const f = fixture(t);
  writeFileSync(join(f.base, ".gitignore"), "*.md\n");
  assert.equal((await readNamedDocument(`${f.root}/`, { path: "guide.md" })).ok, true);
});

test("native policy matching covers root, nested, repository, system-configured/global and tracked ignored paths", async (t) => {
  for (const source of ["root", "nested", "repository", "global", "system", "tracked"]) {
    await t.test(source, async (t) => {
      const f = fixture(t);
      const path = source === "nested" ? "docs/guide.md" : "guide.md";
      f.put(path, "CANDIDATE_MARKER\n");
      if (source === "tracked") f.git("add", "guide.md");
      if (source === "root" || source === "tracked") f.put(".gitignore", "guide.md\n");
      if (source === "nested") { f.put(".gitignore", "other.md\n"); f.put("docs/.gitignore", "guide.md\n"); }
      if (source === "repository") f.put(".git/info/exclude", "guide.md\n");
      if (source === "global") writeFileSync(join(f.home, ".config/git/ignore"), "guide.md\n");
      if (source === "system") {
        const policy = join(f.base, "owner's global ignore");
        writeFileSync(policy, "guide.md\n");
        f.git("config", "--file", f.system, "core.excludesFile", policy);
      }
      const opened = watchCandidate(t, f.root);
      failure(await readNamedDocument(f.root, { path }), "READ_EXCLUDED");
      assert.equal(opened.includes(join(f.root, path)), false);
    });
  }
});

test("native negation, configuration precedence, tilde and relative global paths work", async (t) => {
  const f = fixture(t);
  f.put("docs/guide.md");
  f.put(".gitignore", "*.md\n");
  f.put("docs/.gitignore", "!guide.md\n");
  assert.equal((await readNamedDocument(f.root, { path: "docs/guide.md" })).ok, true);
  f.git("config", "--file", f.system, "core.excludesFile", join(f.base, "absent-ignore"));
  writeFileSync(join(f.home, "user.ignore"), "guide.md\n");
  f.git("config", "--global", "core.excludesFile", "~/user.ignore");
  failure(await readNamedDocument(f.root, { path: "guide.md" }), "READ_EXCLUDED");
  f.git("config", "core.excludesFile", "local.ignore");
  f.put("local.ignore", "# POLICY_MARKER\n");
  f.put(".gitignore", "other.md\n");
  assert.equal((await readNamedDocument(f.root, { path: "guide.md" })).ok, true);
});

test("default global ignore falls back to HOME when XDG is unset", async (t) => {
  const f = fixture(t);
  delete process.env.XDG_CONFIG_HOME;
  writeFileSync(join(f.home, ".config/git/ignore"), "guide.md\n");
  failure(await readNamedDocument(f.root, { path: "guide.md" }), "READ_EXCLUDED");
});

test("stored and additive session exclusions only restrict, and never expose opaque settings", async (t) => {
  const f = fixture(t);
  f.put(".picm/config.json", JSON.stringify({ opaque: "CONFIG_MARKER", privacy: { excludedPaths: ["guide.md"] } }));
  failure(await readNamedDocument(f.root, { path: "guide.md", excludedPaths: [] }), "READ_EXCLUDED");
  f.put(".picm/config.json", JSON.stringify({ opaque: "CONFIG_MARKER" }));
  failure(await readNamedDocument(f.root, { path: "guide.md", excludedPaths: ["GUIDE.md"] }), "READ_EXCLUDED");
  assert.equal((await readNamedDocument(f.root, { path: "guide.md", excludedPaths: ["other"] })).ok, true);
  failure(await readNamedDocument(f.root, { path: "guide.md", excludedPaths: ["../outside"] }), "READ_INVALID_REQUEST");
  f.put("café.md");
  failure(await readNamedDocument(f.root, { path: "café.md", excludedPaths: ["cafe\u0301.md"] }), "READ_EXCLUDED");
});

test("settings failures stop before any policy or candidate open with a fixed sanitized error", async (t) => {
  for (const contents of ["{CONFIG_MARKER", JSON.stringify({ privacy: { excludedPaths: "CONFIG_MARKER" } }), JSON.stringify({ maintenance: { mode: "CONFIG_MARKER" } })]) {
    await t.test("invalid projected settings", async (t) => {
      const f = fixture(t);
      f.put(".picm/config.json", contents);
      const opened = watchCandidate(t, f.root);
      failure(await readNamedDocument(f.root, { path: "guide.md" }), "READ_SETTINGS_FAILED");
      assert.deepEqual(opened, []);
    });
  }
});

test("actual settings EACCES returns only the bounded settings failure", async (t) => {
  const f = fixture(t);
  const config = f.put(".picm/config.json", '{"opaque":"CONFIG_MARKER"}');
  chmodSync(config, 0);
  try { readFileSync(config); t.skip("Executing UID can read mode-000 config; EACCES not established"); return; }
  catch (error) { assert.equal(error.code, "EACCES"); }
  const opened = watchCandidate(t, f.root);
  failure(await readNamedDocument(f.root, { path: "guide.md" }), "READ_SETTINGS_FAILED");
  assert.deepEqual(opened, []);
});

test("actual policy EACCES under the executing UID stops before candidate access", async (t) => {
  for (const source of ["root", "nested", "repository", "global"]) {
    await t.test(source, async (t) => {
      const f = fixture(t);
      let path = "guide.md";
      let policy;
      if (source === "root") policy = f.put(".gitignore", "# POLICY_MARKER\n");
      if (source === "nested") { path = "docs/guide.md"; f.put(path); policy = f.put("docs/.gitignore", "# POLICY_MARKER\n"); }
      if (source === "repository") policy = f.put(".git/info/exclude", "# POLICY_MARKER\n");
      if (source === "global") { policy = join(f.home, ".config/git/ignore"); writeFileSync(policy, "# POLICY_MARKER\n"); }
      chmodSync(policy, 0);
      try { readFileSync(policy); t.skip("Executing UID can read mode-000 files; EACCES not established"); return; }
      catch (error) { assert.equal(error.code, "EACCES"); }
      const opened = watchCandidate(t, f.root);
      failure(await readNamedDocument(f.root, { path }), "READ_POLICY_FAILED");
      assert.equal(opened.includes(join(f.root, path)), false);
    });
  }
});

test("nonregular and linked policy sources are rejected before candidate content", async (t) => {
  for (const kind of ["symlink", "directory", "fifo", "hardlink", "linked-parent"]) {
    await t.test(kind, async (t) => {
      const f = fixture(t);
      const source = join(f.root, ".gitignore");
      if (kind === "symlink") symlinkSync(f.put("policy", "# POLICY_MARKER\n"), source);
      if (kind === "directory") mkdirSync(source);
      if (kind === "fifo") execFileSync("mkfifo", [source]);
      if (kind === "hardlink") linkSync(f.put("policy", "# POLICY_MARKER\n"), source);
      if (kind === "linked-parent") {
        const external = join(f.base, "policies"); mkdirSync(external);
        writeFileSync(join(external, "ignore"), "# POLICY_MARKER\n");
        symlinkSync(external, join(f.base, "policy-link"));
        f.git("config", "core.excludesFile", join(f.base, "policy-link/ignore"));
      }
      const opened = watchCandidate(t, f.root);
      failure(await readNamedDocument(f.root, { path: "guide.md" }), "READ_POLICY_FAILED");
      assert.equal(opened.includes(join(f.root, "guide.md")), false);
    });
  }
});

test("unsupported includes, malformed configs, links, and FIFO bootstrap never open candidate content", async (t) => {
  for (const kind of ["include", "includeIf", "malformed", "config-link", "config-fifo", "worktree-config"]) {
    await t.test(kind, async (t) => {
      const f = fixture(t);
      const included = join(f.base, "included.config");
      writeFileSync(included, "[custom]\n value = CONFIG_MARKER\n");
      if (kind === "include") f.git("config", "include.path", included);
      if (kind === "includeIf") f.git("config", 'includeIf.gitdir:/not-this-repo/.path', included);
      if (kind === "malformed") writeFileSync(f.system, "[CONFIG_MARKER\n");
      if (kind === "config-link") { unlinkSync(f.system); symlinkSync(included, f.system); }
      if (kind === "config-fifo") { unlinkSync(f.system); execFileSync("mkfifo", [f.system]); }
      if (kind === "worktree-config") f.git("config", "extensions.worktreeConfig", "true");
      const opened = watchCandidate(t, f.root);
      failure(await readNamedDocument(f.root, { path: "guide.md" }));
      assert.equal(opened.includes(join(f.root, "guide.md")), false);
    });
  }
});

test("native source paths preserve trailing spaces and reject newline ambiguity", async (t) => {
  await t.test("trailing space", async (t) => {
    const f = fixture(t);
    const source = `${f.system} `;
    writeFileSync(source, "# POLICY_MARKER\n");
    writeFileSync(f.launcher, f.launcherText.replace(f.system, source));
    const opened = watchCandidate(t, f.root);
    assert.equal((await readNamedDocument(f.root, { path: "guide.md" })).ok, true);
    assert.ok(opened.includes(source));
  });
  await t.test("newline", async (t) => {
    const f = fixture(t);
    const source = `${f.system}\nsecond`;
    writeFileSync(source, "# POLICY_MARKER\n");
    writeFileSync(f.launcher, f.launcherText.replace(f.system, source));
    const opened = watchCandidate(t, f.root);
    failure(await readNamedDocument(f.root, { path: "guide.md" }), "READ_UNSUPPORTED_CONFIGURATION");
    assert.equal(opened.includes(join(f.root, "guide.md")), false);
  });
});

test("the named document cannot double as a helper-read policy source", async (t) => {
  const f = fixture(t);
  f.git("config", "core.excludesFile", join(f.root, "guide.md"));
  const opened = watchCandidate(t, f.root);
  failure(await readNamedDocument(f.root, { path: "guide.md" }), "READ_UNSUPPORTED_CONFIGURATION");
  assert.equal(opened.includes(join(f.root, "guide.md")), false);
});

test("a hard-linked policy alias of the candidate is refused before either helper-controlled open", async (t) => {
  const f = fixture(t);
  const alias = join(f.root, "alias.ignore");
  linkSync(join(f.root, "guide.md"), alias);
  f.git("config", "core.excludesFile", alias);
  const opened = watchCandidate(t, f.root);
  failure(await readNamedDocument(f.root, { path: "guide.md" }), "READ_POLICY_FAILED");
  assert.equal(opened.includes(alias), false);
  assert.equal(opened.includes(join(f.root, "guide.md")), false);
});

test("native subprocess output overflow is sanitized and settles promptly", async (t) => {
  const f = fixture(t);
  writeFileSync(f.launcher, "#!/bin/sh\nexec /usr/bin/yes CONFIG_MARKER\n");
  const opened = watchCandidate(t, f.root);
  const before = Date.now();
  failure(await readNamedDocument(f.root, { path: "guide.md" }), "READ_UNSUPPORTED_CONFIGURATION");
  assert.ok(Date.now() - before < 4000);
  assert.equal(opened.includes(join(f.root, "guide.md")), false);
});

test("environment overrides and additional ignore policy fail only this optional operation", async (t) => {
  for (const key of ["GIT_CONFIG_SYSTEM", "GIT_CONFIG_GLOBAL", "GIT_CONFIG_COUNT", "GIT_DIR", "GIT_WORK_TREE", "RIPGREP_CONFIG_PATH"]) {
    await t.test(key, async (t) => {
      const f = fixture(t);
      process.env[key] = "CONFIG_MARKER";
      failure(await readNamedDocument(f.root, { path: "guide.md" }), "READ_UNSUPPORTED_CONFIGURATION");
    });
  }
  for (const path of [".ignore", ".rgignore", "docs/.ignore", "docs/.rgignore", "../.ignore"]) {
    await t.test(path, async (t) => {
      const f = fixture(t);
      f.put("docs/guide.md"); f.put(path, "# POLICY_MARKER\n");
      failure(await readNamedDocument(f.root, { path: "docs/guide.md" }), "READ_UNSUPPORTED_CONFIGURATION");
    });
  }
});

test("non-Git roots, linked worktrees, and nested repositories are unsupported", async (t) => {
  const f = fixture(t);
  failure(await readNamedDocument(f.home, { path: "guide.md" }), "READ_UNSUPPORTED_WORKSPACE");
  const nested = join(f.root, "nested"); mkdirSync(nested); f.git("-C", nested, "init", "-q");
  f.put("nested/guide.md");
  failure(await readNamedDocument(f.root, { path: "nested/guide.md" }), "READ_UNSUPPORTED_WORKSPACE");
  f.put("submodule/.git", "gitdir: ../.git/modules/submodule\n"); f.put("submodule/guide.md");
  failure(await readNamedDocument(f.root, { path: "submodule/guide.md" }), "READ_UNSUPPORTED_WORKSPACE");
  f.put("linked/.git", "gitdir: ../.git/worktrees/linked\n"); f.put("linked/guide.md");
  failure(await readNamedDocument(join(f.root, "linked"), { path: "guide.md" }), "READ_UNSUPPORTED_WORKSPACE");
});

test("rejects escaping, metadata, sensitive, linked and nonregular candidates", async (t) => {
  const f = fixture(t);
  const opened = watchCandidate(t, f.root);
  for (const path of ["../guide.md", "/guide.md", "a/../guide.md", "./guide.md", "a//guide.md", "guide.txt", ".git/guide.md", ".picm/guide.md", ".pi/guide.md", "x\\guide.md", "bad\n.md"]) {
    failure(await readNamedDocument(f.root, { path }), "READ_INVALID_PATH");
  }
  for (const path of [".env.md", ".env.local/guide.md", ".ssh/guide.md", "secrets/guide.md", "credentials.md", "private/key.md", "id_rsa.md", "key.pem.md", "access-token.md"]) {
    failure(await readNamedDocument(f.root, { path }), "READ_EXCLUDED");
  }
  f.put("real/guide.md"); symlinkSync(join(f.root, "real"), join(f.root, "linked"));
  symlinkSync(join(f.root, "guide.md"), join(f.root, "link.md"));
  linkSync(join(f.root, "guide.md"), join(f.root, "hard.md"));
  mkdirSync(join(f.root, "directory.md")); execFileSync("mkfifo", [join(f.root, "fifo.md")]);
  for (const path of ["linked/guide.md", "link.md", "hard.md", "directory.md", "fifo.md"]) {
    failure(await readNamedDocument(f.root, { path }), "READ_INVALID_PATH");
    assert.equal(opened.includes(join(f.root, path)), false);
  }
});

test("option-like, quoted and Unicode filenames are passed as stdin paths, not shell arguments", async (t) => {
  const f = fixture(t);
  for (const path of ["--help.md", "owner's guide.md", "資料.md", "$(not-a-command).md"]) {
    f.put(path);
    assert.equal((await readNamedDocument(f.root, { path })).ok, true, path);
  }
});

test("fixed byte limits, malformed UTF-8 and binary controls refuse without leaking contents", async (t) => {
  const f = fixture(t);
  f.put("guide.md", "a".repeat(65536));
  assert.equal((await readNamedDocument(f.root, { path: "guide.md" })).bytes, 65536);
  f.put("guide.md", "a".repeat(65537));
  failure(await readNamedDocument(f.root, { path: "guide.md" }), "READ_TOO_LARGE");
  for (const bytes of [Buffer.from([0xc3, 0x28]), Buffer.from("CANDIDATE_MARKER\0")]) {
    f.put("guide.md", bytes);
    failure(await readNamedDocument(f.root, { path: "guide.md" }), "READ_INVALID_UTF8");
  }
  f.put(".gitignore", "# POLICY_MARKER\n".repeat(20000));
  failure(await readNamedDocument(f.root, { path: "guide.md" }), "READ_POLICY_FAILED");
});

test("the byte limit holds while a candidate grows during the read", async (t) => {
  const f = fixture(t);
  const path = f.put("guide.md", "a".repeat(65536));
  let length = 0;
  watchCandidate(t, f.root, (handle) => {
    const read = handle.read.bind(handle);
    handle.read = async (...args) => {
      appendFileSync(path, "b");
      const result = await read(...args);
      length += result.bytesRead;
      return result;
    };
  });
  failure(await readNamedDocument(f.root, { path: "guide.md" }), "READ_TOO_LARGE");
  assert.equal(length, 65537);
});

test("unrelated sibling-directory creation doesn't invalidate a document read", async (t) => {
  const f = fixture(t);
  watchCandidate(t, f.root, () => mkdirSync(join(f.base, "unrelated")));
  assert.equal((await readNamedDocument(f.root, { path: "guide.md" })).ok, true);
});

test("policy changes during a candidate read discard the result", async (t) => {
  const f = fixture(t);
  f.put("guide.md", "CANDIDATE_MARKER\n");
  watchCandidate(t, f.root, () => f.put(".gitignore", "guide.md\n"));
  failure(await readNamedDocument(f.root, { path: "guide.md" }), "READ_CHANGED");
});

test("cancellation before work, during Git, and during a read produces no document", async (t) => {
  await t.test("before", async (t) => {
    const f = fixture(t); const controller = new AbortController(); controller.abort();
    const opened = watchCandidate(t, f.root);
    failure(await readNamedDocument(f.root, { path: "guide.md" }, controller.signal), "READ_CANCELLED");
    assert.deepEqual(opened, []);
  });
  await t.test("Git subprocess", async (t) => {
    const f = fixture(t); const controller = new AbortController();
    writeFileSync(f.launcher, "#!/bin/sh\nexec /bin/sleep 10\n");
    const timer = setTimeout(() => controller.abort(), 100);
    t.after(() => clearTimeout(timer));
    const before = Date.now();
    failure(await readNamedDocument(f.root, { path: "guide.md" }, controller.signal), "READ_CANCELLED");
    assert.ok(Date.now() - before < 4000);
  });
  await t.test("candidate read", async (t) => {
    const f = fixture(t); const controller = new AbortController();
    f.put("guide.md", "CANDIDATE_MARKER\n");
    watchCandidate(t, f.root, (handle) => {
      const read = handle.read.bind(handle);
      handle.read = async (...args) => { const result = await read(...args); controller.abort(); return result; };
    });
    failure(await readNamedDocument(f.root, { path: "guide.md" }, controller.signal), "READ_CANCELLED");
  });
});
