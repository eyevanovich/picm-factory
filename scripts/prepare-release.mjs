import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const TAG_PATTERN = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const CONVENTIONAL_SUBJECT_PATTERN =
  /^(?<type>[a-z][a-z0-9-]*)(?:\((?<scope>[^)\r\n]+)\))?(?<breaking>!)?:\s+(?<description>.+)$/i;
const BREAKING_FOOTER_PATTERN = /(?:^|\n)BREAKING(?: |-)CHANGE:\s*\S/im;
const BUMP_PRIORITY = { patch: 1, minor: 2, major: 3 };

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function formatDescription(description) {
  const trimmed = description.trim();
  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capitalized) ? capitalized : `${capitalized}.`;
}

export function analyzeCommit({ subject, body = "" }) {
  const match = subject.match(CONVENTIONAL_SUBJECT_PATTERN);
  if (!match) {
    return null;
  }
  const type = match.groups.type.toLowerCase();
  const breaking = Boolean(match.groups.breaking) || BREAKING_FOOTER_PATTERN.test(body);

  let bump;
  if (breaking) {
    bump = "major";
  } else if (type === "feat") {
    bump = "minor";
  } else if (type === "fix") {
    bump = "patch";
  } else {
    return null;
  }

  const category = type === "feat" ? "Added" : type === "fix" ? "Fixed" : "Changed";
  const description = match.groups.description;

  return {
    bump,
    category,
    description: formatDescription(description),
  };
}

export function selectBump(commits) {
  return commits.reduce((selected, commit) => {
    const analyzed = analyzeCommit(commit);
    if (!analyzed) {
      return selected;
    }
    if (!selected || BUMP_PRIORITY[analyzed.bump] > BUMP_PRIORITY[selected]) {
      return analyzed.bump;
    }
    return selected;
  }, null);
}

export function bumpVersion(version, bump) {
  const match = version.match(SEMVER_PATTERN);
  if (!match) {
    throw new Error(`Unsupported package version: ${version}`);
  }

  let major = Number(match[1]);
  let minor = Number(match[2]);
  let patch = Number(match[3]);

  if (bump === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (bump === "minor") {
    minor += 1;
    patch = 0;
  } else if (bump === "patch") {
    patch += 1;
  } else {
    throw new Error(`Unsupported release bump: ${bump}`);
  }

  return `${major}.${minor}.${patch}`;
}

export function extractReleaseDescriptions(body = "") {
  const heading = /^##[ \t]+What Changed[ \t]*$/im.exec(body);
  if (!heading) {
    return [];
  }

  const remainder = body.slice(heading.index + heading[0].length).replace(/^\r?\n/, "");
  const nextHeading = remainder.search(/^##[ \t]+/m);
  const section = nextHeading === -1 ? remainder : remainder.slice(0, nextHeading);

  return section
    .split(/\r?\n/)
    .map((line) => line.match(/^-\s+(.+)$/)?.[1]?.trim())
    .filter(Boolean)
    .map(formatDescription);
}

export function buildReleaseNotes(version, date, commits) {
  const entries = { Added: [], Changed: [], Fixed: [] };
  for (const commit of commits) {
    const analyzed = analyzeCommit(commit);
    if (analyzed) {
      const descriptions = extractReleaseDescriptions(commit.body);
      entries[analyzed.category].push(
        ...(descriptions.length > 0 ? descriptions : [analyzed.description]),
      );
    }
  }

  const sections = [`## [${version}] - ${date}`];
  for (const category of ["Added", "Changed", "Fixed"]) {
    if (entries[category].length === 0) {
      continue;
    }
    sections.push(`### ${category}\n\n${entries[category].map((entry) => `- ${entry}`).join("\n")}`);
  }
  return sections.join("\n\n");
}

function readCommits(root, baseTag) {
  const output = git(root, [
    "log",
    `${baseTag}..HEAD`,
    "--format=%H%x1f%s%x1f%b%x1e",
  ]);
  if (!output) {
    return [];
  }

  return output
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [hash, subject, body = ""] = record.split("\x1f");
      return { hash, subject, body };
    });
}

function lookupPullRequests(repository, hash) {
  const pages = JSON.parse(
    execFileSync(
      "gh",
      ["api", "--paginate", "--slurp", `repos/${repository}/commits/${hash}/pulls`],
      { encoding: "utf8" },
    ),
  );
  return pages.flat();
}

export function selectMergedPullRequests(
  commits,
  {
    repository,
    defaultBranch,
    lookup = (hash) => lookupPullRequests(repository, hash),
  },
) {
  if (!repository || !defaultBranch) {
    throw new Error("Merged pull-request validation requires a repository and default branch");
  }

  const selected = new Map();
  for (const commit of commits) {
    const pullRequests = lookup(commit.hash);
    for (const pullRequest of pullRequests) {
      if (
        pullRequest.merged_at &&
        pullRequest.base?.ref === defaultBranch &&
        !selected.has(pullRequest.number)
      ) {
        selected.set(pullRequest.number, {
          hash: commit.hash,
          subject: pullRequest.title,
          body: pullRequest.body ?? "",
          pullRequest: pullRequest.number,
        });
      }
    }
  }
  return [...selected.values()];
}

function latestReleaseTag(root) {
  const tags = git(root, [
    "tag",
    "--merged",
    "HEAD",
    "--list",
    "v*",
    "--sort=-v:refname",
  ]).split("\n");
  const tag = tags.find((candidate) => TAG_PATTERN.test(candidate));
  if (!tag) {
    throw new Error("No reachable v<major>.<minor>.<patch> release tag was found");
  }
  return tag;
}

function insertChangelogEntry(changelog, notes) {
  const firstRelease = changelog.indexOf("\n## [");
  if (firstRelease === -1) {
    throw new Error("CHANGELOG.md does not contain an existing release heading");
  }
  return `${changelog.slice(0, firstRelease).trimEnd()}\n\n${notes}\n\n${changelog
    .slice(firstRelease)
    .trimStart()}`;
}

export function prepareRelease({
  root = process.cwd(),
  releaseDate = new Date().toISOString().slice(0, 10),
  notesFile,
  dryRun = false,
  requireMergedPullRequests = false,
  repository = process.env.GITHUB_REPOSITORY,
  defaultBranch = process.env.DEFAULT_BRANCH,
  pullRequestLookup,
} = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) {
    throw new Error(`Invalid release date: ${releaseDate}`);
  }
  if (git(root, ["status", "--porcelain"])) {
    throw new Error("Release preparation requires a clean worktree");
  }

  const packagePath = resolve(root, "package.json");
  const changelogPath = resolve(root, "CHANGELOG.md");
  const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
  const baseTag = latestReleaseTag(root);
  const baseVersion = baseTag.slice(1);
  if (pkg.version !== baseVersion) {
    throw new Error(
      `package.json version ${pkg.version} does not match latest release tag ${baseTag}`,
    );
  }

  const taggedPackage = JSON.parse(git(root, ["show", `${baseTag}:package.json`]));
  if (taggedPackage.version !== baseVersion) {
    throw new Error(`${baseTag} does not contain package version ${baseVersion}`);
  }

  const gitCommits = readCommits(root, baseTag);
  const commits = requireMergedPullRequests
    ? selectMergedPullRequests(gitCommits, {
        repository,
        defaultBranch,
        lookup: pullRequestLookup,
      })
    : gitCommits;
  const bump = selectBump(commits);
  if (!bump) {
    throw new Error(`No releasable feat, fix, or breaking commits exist after ${baseTag}`);
  }

  const version = bumpVersion(baseVersion, bump);
  const tag = `v${version}`;
  const existingTag = git(root, ["tag", "--list", tag]);
  if (existingTag) {
    throw new Error(`Release tag already exists: ${tag}`);
  }

  const notes = buildReleaseNotes(version, releaseDate, commits);
  const changelog = readFileSync(changelogPath, "utf8");
  if (changelog.includes(`## [${version}]`)) {
    throw new Error(`CHANGELOG.md already contains version ${version}`);
  }

  if (!dryRun) {
    pkg.version = version;
    writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
    writeFileSync(changelogPath, insertChangelogEntry(changelog, notes));
    if (notesFile) {
      writeFileSync(notesFile, `${notes}\n`);
    }
  }

  return { baseTag, bump, version, tag, notes, commits };
}

function parseArguments(args) {
  const options = { dryRun: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--dry-run") {
      options.dryRun = true;
    } else if (argument === "--require-merged-prs") {
      options.requireMergedPullRequests = true;
    } else if (argument === "--notes-file") {
      options.notesFile = args[index + 1];
      index += 1;
      if (!options.notesFile) {
        throw new Error("--notes-file requires a path");
      }
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  return options;
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const result = prepareRelease(options);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `base_tag=${result.baseTag}\nbump=${result.bump}\nversion=${result.version}\ntag=${result.tag}\n`,
    );
  }
  console.log(
    `Prepared ${result.tag} (${result.bump}) from ${result.commits.length} qualifying changes.`,
  );
  if (options.dryRun) {
    console.log(result.notes);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
