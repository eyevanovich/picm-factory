import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  analyzeCommit,
  buildReleaseNotes,
  bumpVersion,
  prepareRelease,
  selectBump,
  selectMergedPullRequests,
  updatePinnedInstallVersion,
} from "../scripts/prepare-release.mjs";

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function writePinnedDocs(root, version) {
  writeFileSync(
    join(root, "README.md"),
    `Install with pi install -l npm:@eyevanovich/picm-factory@${version}\n`,
  );
  mkdirSync(join(root, "skills/picm-factory"), { recursive: true });
  writeFileSync(
    join(root, "skills/picm-factory/SKILL.md"),
    `Install with pi install -l npm:@eyevanovich/picm-factory@${version}\n`,
  );
}

function packageLock(version) {
  return {
    name: "fixture",
    version,
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": {
        name: "fixture",
        version,
        dependencies: { "fixture-dependency": "1.0.0" },
      },
      "node_modules/fixture-dependency": {
        version: "1.0.0",
        resolved: "https://registry.npmjs.org/fixture-dependency/-/fixture-dependency-1.0.0.tgz",
        integrity: "sha512-synthetic-lock-fixture",
      },
    },
  };
}

function writePackageLock(root, lock) {
  writeFileSync(join(root, "package-lock.json"), `${JSON.stringify(lock, null, 2)}\n`);
}

function createTaggedReleaseFixture(root, lock = packageLock("0.1.2")) {
  const files = {
    "package.json": `${JSON.stringify({ name: "fixture", version: "0.1.2" }, null, 2)}\n`,
    "CHANGELOG.md": "# Changelog\n\nFixture history.\n\n## [0.1.2] - 2026-07-21\n\n- Bootstrap.\n",
  };
  writeFileSync(join(root, "package.json"), files["package.json"]);
  writeFileSync(join(root, "CHANGELOG.md"), files["CHANGELOG.md"]);
  writePinnedDocs(root, "0.1.2");
  writePackageLock(root, lock);
  for (const path of ["package-lock.json", "README.md", "skills/picm-factory/SKILL.md"]) {
    files[path] = readFileSync(join(root, path), "utf8");
  }

  git(root, "init", "-q");
  git(root, "config", "user.name", "Release Test");
  git(root, "config", "user.email", "release-test@example.invalid");
  git(
    root,
    "add",
    "package.json",
    "package-lock.json",
    "CHANGELOG.md",
    "README.md",
    "skills/picm-factory/SKILL.md",
  );
  git(root, "commit", "-qm", "chore: bootstrap");
  git(root, "tag", "--no-sign", "v0.1.2");
  writeFileSync(join(root, "feature.txt"), "feature\n");
  git(root, "add", "feature.txt");
  git(root, "commit", "-qm", "feat: add fixture feature");

  return files;
}

test("maps Conventional Commits to literal SemVer bumps", () => {
  assert.equal(analyzeCommit({ subject: "fix: repair release guard" }).bump, "patch");
  assert.equal(analyzeCommit({ subject: "feat(api): add release endpoint" }).bump, "minor");
  assert.equal(analyzeCommit({ subject: "feat!: replace release format" }).bump, "major");
  assert.equal(
    analyzeCommit({
      subject: "refactor: replace release format",
      body: "BREAKING CHANGE: the old format is unsupported",
    }).bump,
    "major",
  );
  assert.equal(analyzeCommit({ subject: "docs: clarify releases" }), null);
  assert.equal(
    analyzeCommit({
      subject: "Update release format",
      body: "BREAKING CHANGE: the old format is unsupported",
    }),
    null,
  );
  assert.equal(bumpVersion("0.1.2", "major"), "1.0.0");
});

test("updates pinned install commands to the prepared release version", () => {
  assert.equal(
    updatePinnedInstallVersion(
      "pi install -l npm:@eyevanovich/picm-factory@0.2.0\n",
      "0.3.0",
    ),
    "pi install -l npm:@eyevanovich/picm-factory@0.3.0\n",
  );
  assert.throws(
    () => updatePinnedInstallVersion("no install command\n", "0.3.0"),
    /Pinned PiCM Factory install command was not found/,
  );
});

test("selects the highest bump across unreleased commits", () => {
  assert.equal(
    selectBump([
      { subject: "fix: correct typo" },
      { subject: "feat: add command" },
      { subject: "docs: explain command" },
    ]),
    "minor",
  );
  assert.equal(selectBump([{ subject: "docs: explain command" }]), null);
});

test("uses merged default-branch pull-request titles and excludes direct commits", () => {
  const commits = [
    { hash: "direct", subject: "feat: direct commit", body: "" },
    { hash: "squash", subject: "unrelated squash subject", body: "" },
    { hash: "duplicate", subject: "second commit from same PR", body: "" },
    { hash: "other-branch", subject: "fix: other branch", body: "" },
  ];
  const pullRequests = {
    direct: [],
    squash: [
      {
        number: 42,
        title: "feat: merged feature",
        body: "",
        merged_at: "2026-07-22T12:00:00Z",
        base: { ref: "main" },
      },
    ],
    duplicate: [
      {
        number: 42,
        title: "feat: merged feature",
        body: "",
        merged_at: "2026-07-22T12:00:00Z",
        base: { ref: "main" },
      },
    ],
    "other-branch": [
      {
        number: 43,
        title: "fix: other branch",
        body: "",
        merged_at: "2026-07-22T12:00:00Z",
        base: { ref: "develop" },
      },
    ],
  };

  assert.deepEqual(
    selectMergedPullRequests(commits, {
      repository: "owner/repository",
      defaultBranch: "main",
      lookup: (hash) => pullRequests[hash],
    }),
    [
      {
        hash: "squash",
        subject: "feat: merged feature",
        body: "",
        pullRequest: 42,
      },
    ],
  );
});

test("builds changelog sections from releasable commits", () => {
  const notes = buildReleaseNotes("0.2.0", "2026-07-22", [
    { subject: "fix: correct release check" },
    { subject: "feat(cli): add release command" },
    { subject: "chore: update tooling" },
  ]);

  assert.equal(
    notes,
    [
      "## [0.2.0] - 2026-07-22",
      "### Added\n\n- Add release command.",
      "### Fixed\n\n- Correct release check.",
    ].join("\n\n"),
  );
});

test("uses reviewed What Changed bullets for release notes", () => {
  const notes = buildReleaseNotes("0.2.0", "2026-07-22", [
    {
      subject: "feat: add coding repository profile",
      body: [
        "## Intent",
        "",
        "Support coding repositories.",
        "",
        "## What Changed",
        "",
        "- Add root and distributed context maps.",
        "-    ",
        "- Harden ignored-file scan boundaries.",
        "",
        "## Testing",
        "",
        "- npm run check",
      ].join("\n"),
    },
  ]);

  assert.equal(
    notes,
    [
      "## [0.2.0] - 2026-07-22",
      "### Added\n\n- Add root and distributed context maps.\n- Harden ignored-file scan boundaries.",
    ].join("\n\n"),
  );
});

test("leaves release files unchanged when post-tag commits are not merged pull requests", () => {
  const root = mkdtempSync(join(tmpdir(), "picm-release-direct-test-"));
  try {
    const packageText = `${JSON.stringify({ name: "fixture", version: "0.1.2" }, null, 2)}\n`;
    const changelogText =
      "# Changelog\n\nFixture history.\n\n## [0.1.2] - 2026-07-21\n\n- Bootstrap.\n";
    writeFileSync(join(root, "package.json"), packageText);
    writeFileSync(join(root, "CHANGELOG.md"), changelogText);
    writePinnedDocs(root, "0.1.2");
    writePackageLock(root, packageLock("0.1.2"));
    const lockText = readFileSync(join(root, "package-lock.json"), "utf8");
    const readmeText = readFileSync(join(root, "README.md"), "utf8");
    const skillText = readFileSync(join(root, "skills/picm-factory/SKILL.md"), "utf8");
    git(root, "init", "-q");
    git(root, "config", "user.name", "Release Test");
    git(root, "config", "user.email", "release-test@example.invalid");
    git(
      root,
      "add",
      "package.json",
      "package-lock.json",
      "CHANGELOG.md",
      "README.md",
      "skills/picm-factory/SKILL.md",
    );
    git(root, "commit", "-qm", "chore: bootstrap");
    git(root, "tag", "--no-sign", "v0.1.2");
    writeFileSync(join(root, "direct.txt"), "direct\n");
    git(root, "add", "direct.txt");
    git(root, "commit", "-qm", "feat: direct commit");

    assert.throws(
      () =>
        prepareRelease({
          root,
          requireMergedPullRequests: true,
          repository: "owner/repository",
          defaultBranch: "main",
          pullRequestLookup: () => [],
        }),
      /No releasable feat, fix, or breaking commits/,
    );
    assert.equal(readFileSync(join(root, "package.json"), "utf8"), packageText);
    assert.equal(readFileSync(join(root, "package-lock.json"), "utf8"), lockText);
    assert.equal(readFileSync(join(root, "CHANGELOG.md"), "utf8"), changelogText);
    assert.equal(readFileSync(join(root, "README.md"), "utf8"), readmeText);
    assert.equal(readFileSync(join(root, "skills/picm-factory/SKILL.md"), "utf8"), skillText);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("prepares package, changelog, and release notes from commits after the latest tag", () => {
  const root = mkdtempSync(join(tmpdir(), "picm-release-test-"));
  try {
    writeFileSync(
      join(root, "package.json"),
      `${JSON.stringify({ name: "fixture", version: "0.1.2" }, null, 2)}\n`,
    );
    writeFileSync(
      join(root, "CHANGELOG.md"),
      "# Changelog\n\nFixture history.\n\n## [0.1.2] - 2026-07-21\n\n- Bootstrap.\n",
    );
    writePinnedDocs(root, "0.1.2");
    writePackageLock(root, packageLock("0.1.2"));
    const initialLock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
    const lockedDependencyGraph = { ...initialLock.packages };
    delete lockedDependencyGraph[""];
    git(root, "init", "-q");
    git(root, "config", "user.name", "Release Test");
    git(root, "config", "user.email", "release-test@example.invalid");
    git(
      root,
      "add",
      "package.json",
      "package-lock.json",
      "CHANGELOG.md",
      "README.md",
      "skills/picm-factory/SKILL.md",
    );
    git(root, "commit", "-qm", "chore: bootstrap");
    git(root, "tag", "--no-sign", "v0.1.2");

    writeFileSync(join(root, "feature.txt"), "feature\n");
    git(root, "add", "feature.txt");
    git(root, "commit", "-qm", "feat: add fixture feature");

    writeFileSync(join(root, "fix.txt"), "fix\n");
    git(root, "add", "fix.txt");
    git(root, "commit", "-qm", "fix: correct fixture");

    const notesFile = join(root, "release-notes.md");
    const result = prepareRelease({
      root,
      releaseDate: "2026-07-22",
      notesFile,
    });

    assert.deepEqual(
      { baseTag: result.baseTag, bump: result.bump, version: result.version, tag: result.tag },
      { baseTag: "v0.1.2", bump: "minor", version: "0.2.0", tag: "v0.2.0" },
    );
    assert.equal(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version, "0.2.0");
    const preparedLock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
    assert.equal(preparedLock.version, "0.2.0");
    assert.equal(preparedLock.packages[""].version, "0.2.0");
    assert.deepEqual(preparedLock.packages[""].dependencies, initialLock.packages[""].dependencies);
    const preparedDependencyGraph = { ...preparedLock.packages };
    delete preparedDependencyGraph[""];
    assert.deepEqual(preparedDependencyGraph, lockedDependencyGraph);
    assert.match(readFileSync(join(root, "CHANGELOG.md"), "utf8"), /^## \[0\.2\.0\]/m);
    assert.match(
      readFileSync(join(root, "README.md"), "utf8"),
      /picm-factory@0\.2\.0/,
    );
    assert.match(
      readFileSync(join(root, "skills/picm-factory/SKILL.md"), "utf8"),
      /picm-factory@0\.2\.0/,
    );
    assert.match(readFileSync(notesFile, "utf8"), /Add fixture feature\./);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("does not write release files during a dry run", () => {
  const root = mkdtempSync(join(tmpdir(), "picm-release-dry-run-test-"));
  try {
    const files = createTaggedReleaseFixture(root);
    const notesFile = join(root, "release-notes.md");

    const result = prepareRelease({
      root,
      releaseDate: "2026-07-22",
      notesFile,
      dryRun: true,
    });

    assert.equal(result.version, "0.2.0");
    for (const [path, text] of Object.entries(files)) {
      assert.equal(readFileSync(join(root, path), "utf8"), text);
    }
    assert.equal(existsSync(notesFile), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects invalid package-lock metadata before release writes", () => {
  const root = mkdtempSync(join(tmpdir(), "picm-release-invalid-lock-test-"));
  try {
    const lock = packageLock("0.1.2");
    delete lock.packages[""].version;
    const files = createTaggedReleaseFixture(root, lock);

    assert.throws(
      () => prepareRelease({ root, releaseDate: "2026-07-22" }),
      /package-lock\.json packages\[""\] must contain a version/,
    );
    for (const [path, text] of Object.entries(files)) {
      assert.equal(readFileSync(join(root, path), "utf8"), text);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("release workflows install from the committed lockfile before validation", () => {
  const install = "npm ci --ignore-scripts --no-audit --no-fund";
  const release = readFileSync(".github/workflows/release.yml", "utf8");
  const publish = readFileSync(".github/workflows/publish.yml", "utf8");
  const releaseCommit =
    "git add package.json package-lock.json CHANGELOG.md README.md skills/picm-factory/SKILL.md";

  assert.ok(release.indexOf(install) >= 0);
  assert.ok(release.indexOf(install) < release.indexOf("npm run check"));
  assert.ok(publish.indexOf(install) >= 0);
  assert.ok(publish.indexOf(install) < publish.indexOf("npm publish"));
  assert.ok(release.includes(releaseCommit));
});
