import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMaintenanceConfigStore } from "../extensions/runtime/maintenance-config-store.mjs";
import { createMaintenanceController } from "../extensions/runtime/maintenance-controller.mjs";
import { createPolicy } from "../extensions/runtime/maintenance-policy.mjs";

async function repository(t) {
  const cwd = await fs.mkdtemp(join(tmpdir(), "picm-maintenance-"));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  return { cwd };
}

const monthly = createPolicy({ mode: "nudge", intervalValue: 1, intervalUnit: "months", now: "2026-01-01T00:00:00.000Z" });

test("creates only minimal metadata plus explicitly set maintenance", async (t) => {
  const { cwd } = await repository(t);
  const store = createMaintenanceConfigStore({ cwd, randomId: () => "one" });
  const result = await store.updateMaintenance(monthly);
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(await fs.readFile(join(cwd, ".picm/config.json"), "utf8")), {
    version: 1,
    generatedBy: "picm-factory",
    maintenance: monthly,
  });
});

test("persists and conditionally updates normalized privacy exclusions", async (t) => {
  const { cwd } = await repository(t);
  const store = createMaintenanceConfigStore({ cwd, randomId: () => "privacy" });
  const first = await store.updatePrivacy({ excludedPaths: ["secrets/key.txt", "secrets/", ".env"] });
  assert.equal(first.ok, true);
  assert.deepEqual(first.privacy, { excludedPaths: [".env", "secrets"] });
  assert.deepEqual(JSON.parse(await fs.readFile(join(cwd, ".picm/config.json"), "utf8")), {
    version: 1,
    generatedBy: "picm-factory",
    privacy: { excludedPaths: [".env", "secrets"] },
  });

  const conflict = await store.compareAndUpdatePrivacy(
    { excludedPaths: ["different"] },
    { excludedPaths: ["private"] },
  );
  assert.equal(conflict.conflict, true);
  assert.equal(conflict.code, "PRIVACY_POLICY_CONFLICT");
  assert.deepEqual((await store.read()).privacy, { excludedPaths: [".env", "secrets"] });
});

test("settings projection and conditional exclusions preserve opaque config", async (t) => {
  const { cwd } = await repository(t);
  const path = join(cwd, ".picm/config.json");
  await fs.mkdir(join(cwd, ".picm"));
  await fs.writeFile(path, `${JSON.stringify({
    custom: { keep: true },
    privacy: { excludedPaths: ["private"], owner: "preserve" },
  }, null, 2)}\n`);
  const store = createMaintenanceConfigStore({ cwd });

  const settings = await store.readSettings();
  assert.deepEqual(settings, {
    ok: true,
    exists: true,
    privacy: { excludedPaths: ["private"] },
  });
  assert.equal(Object.hasOwn(settings, "config"), false);

  const updated = await store.compareAndUpdatePrivacyExclusions(["private"], ["private", "later"]);
  assert.deepEqual(updated, {
    ok: true,
    changed: true,
    committed: true,
    code: undefined,
    warning: undefined,
    exists: true,
    privacy: { excludedPaths: ["later", "private"] },
  });
  assert.deepEqual(JSON.parse(await fs.readFile(path, "utf8")), {
    custom: { keep: true },
    privacy: { excludedPaths: ["later", "private"], owner: "preserve" },
  });

  const conflict = await store.compareAndUpdatePrivacyExclusions(["private"], ["other"]);
  assert.deepEqual(conflict, {
    ok: true,
    changed: false,
    conflict: true,
    code: "PRIVACY_POLICY_CONFLICT",
    message: "privacy exclusions changed before the conditional update",
    privacy: { excludedPaths: ["later", "private"] },
  });
});

test("invalid config diagnostics do not echo opaque content", async (t) => {
  const { cwd } = await repository(t);
  await fs.mkdir(join(cwd, ".picm"));
  await fs.writeFile(join(cwd, ".picm/config.json"), '{"private":"SYNTHETIC_SECRET",');
  const result = await createMaintenanceConfigStore({ cwd }).readSettings();
  assert.equal(result.code, "CONFIG_INVALID_JSON");
  assert.equal(JSON.stringify(result).includes("SYNTHETIC_SECRET"), false);
  assert.equal(JSON.stringify(result).includes(cwd), false);
});

test("stale exclusion updates do not recreate a removed config directory", async (t) => {
  const { cwd } = await repository(t);
  const store = createMaintenanceConfigStore({ cwd });
  const result = await store.compareAndUpdatePrivacyExclusions(["previous"], ["next"]);
  assert.equal(result.conflict, true);
  assert.equal(result.code, "PRIVACY_POLICY_CONFLICT");
  await assert.rejects(fs.lstat(join(cwd, ".picm")), { code: "ENOENT" });
});

test("rejects malformed or outside privacy exclusions", async (t) => {
  const { cwd } = await repository(t);
  const store = createMaintenanceConfigStore({ cwd });
  assert.equal((await store.updatePrivacy({ excludedPaths: ["../outside"] })).code, "PRIVACY_EXCLUDED_PATH_OUTSIDE");

  await fs.mkdir(join(cwd, ".picm"));
  await fs.writeFile(join(cwd, ".picm/config.json"), JSON.stringify({
    version: 1,
    privacy: { excludedPaths: "secrets" },
  }));
  const invalid = await store.read();
  assert.equal(invalid.ok, false);
  assert.equal(invalid.code, "PRIVACY_EXCLUDED_PATHS_INVALID");
});

test("does not create a config for absent manual policy", async (t) => {
  const { cwd } = await repository(t);
  const store = createMaintenanceConfigStore({ cwd });
  assert.deepEqual(await store.updateMaintenance(undefined), { ok: true, changed: false, exists: false, maintenance: undefined });
  await assert.rejects(fs.access(join(cwd, ".picm/config.json")));
});

test("preserves unknown config fields and existing file mode", async (t) => {
  const { cwd } = await repository(t);
  await fs.mkdir(join(cwd, ".picm"));
  const path = join(cwd, ".picm/config.json");
  await fs.writeFile(path, JSON.stringify({ version: 7, custom: { keep: true }, adoption: { status: "adopted" } }));
  await fs.chmod(path, 0o4640);
  const store = createMaintenanceConfigStore({ cwd });
  const result = await store.updateMaintenance(monthly);
  assert.equal(result.ok, true);
  const config = JSON.parse(await fs.readFile(path, "utf8"));
  assert.equal(config.version, 7);
  assert.deepEqual(config.custom, { keep: true });
  assert.deepEqual(config.adoption, { status: "adopted" });
  assert.deepEqual(config.maintenance, monthly);
  const updatedMode = (await fs.stat(path)).mode;
  assert.equal(updatedMode & 0o777, 0o640);
  assert.equal(updatedMode & 0o7000, 0);
});

test("preserves legacy codebase-map metadata during maintenance policy reads and writes", async (t) => {
  for (const preset of ["light", "balanced", "strict", undefined]) {
    await t.test(preset ?? "absent", async (t) => {
      const { cwd } = await repository(t);
      const codebaseMap = {
        shape: "root",
        roots: ["src"],
        map: "AGENTS.md",
        localContexts: [],
      };
      if (preset !== undefined) codebaseMap.maintenancePreset = preset;
      const original = {
        version: 1,
        capabilities: { codebaseMap },
      };
      const path = join(cwd, ".picm/config.json");
      await fs.mkdir(join(cwd, ".picm"));
      await fs.writeFile(path, `${JSON.stringify(original, null, 2)}\n`);
      const store = createMaintenanceConfigStore({ cwd });

      const read = await store.read();
      assert.equal(read.ok, true);
      assert.deepEqual(read.config, original);

      const updated = await store.updateMaintenance(monthly);
      assert.equal(updated.ok, true);
      const persisted = JSON.parse(await fs.readFile(path, "utf8"));
      assert.deepEqual(persisted.capabilities.codebaseMap, codebaseMap);
      assert.equal(
        Object.hasOwn(persisted.capabilities.codebaseMap, "maintenancePreset"),
        preset !== undefined,
      );
    });
  }
});

test("reads regular configs and blocks linked config paths or directories", async (t) => {
  const regular = await repository(t);
  await fs.mkdir(join(regular.cwd, ".picm"));
  await fs.writeFile(join(regular.cwd, ".picm/config.json"), "{}\n");
  assert.equal((await createMaintenanceConfigStore(regular).read()).ok, true);

  const linked = await repository(t);
  await fs.mkdir(join(linked.cwd, ".picm"));
  await fs.writeFile(join(linked.cwd, "actual.json"), "{}\n");
  await fs.symlink(join(linked.cwd, "actual.json"), join(linked.cwd, ".picm/config.json"));
  const linkedResult = await createMaintenanceConfigStore(linked).read();
  assert.deepEqual(linkedResult, { ok: false, code: "CONFIG_SYMLINK_BLOCKED", message: "PiCM config must not be a symlink" });

  const linkedDirectory = await repository(t);
  await fs.mkdir(join(linkedDirectory.cwd, "actual-picm"));
  await fs.symlink(join(linkedDirectory.cwd, "actual-picm"), join(linkedDirectory.cwd, ".picm"));
  const linkedDirectoryResult = await createMaintenanceConfigStore(linkedDirectory).updateMaintenance(monthly);
  assert.equal(linkedDirectoryResult.ok, false);
  assert.equal(linkedDirectoryResult.code, "CONFIG_DIRECTORY_SYMLINK_BLOCKED");
});

test("blocks hard-linked configs and immediate link replacement", async (t) => {
  const hardLinked = await repository(t);
  await fs.mkdir(join(hardLinked.cwd, ".picm"));
  const hardPath = join(hardLinked.cwd, ".picm/config.json");
  await fs.writeFile(hardPath, "{}\n");
  await fs.link(hardPath, join(hardLinked.cwd, "config-alias.json"));
  assert.equal((await createMaintenanceConfigStore(hardLinked).read()).code, "CONFIG_HARDLINK_BLOCKED");

  const replaced = await repository(t);
  await fs.mkdir(join(replaced.cwd, ".picm"));
  const path = join(replaced.cwd, ".picm/config.json");
  const outside = join(replaced.cwd, "outside.json");
  await fs.writeFile(path, "{}\n");
  await fs.writeFile(outside, '{"privacy":{"excludedPaths":["must-not-load"]}}\n');
  let swapped = false;
  const replacingFs = {
    ...fs,
    async realpath(candidate) {
      if (!swapped && candidate === path) {
        swapped = true;
        await fs.unlink(path);
        await fs.symlink(outside, path);
      }
      return fs.realpath(candidate);
    },
  };
  const result = await createMaintenanceConfigStore({ ...replaced, fs: replacingFs }).read();
  assert.equal(result.code, "CONFIG_OUTSIDE_WORKTREE");
});
test("revalidates .picm after taking the lock", async (t) => {
  const { cwd } = await repository(t);
  await fs.mkdir(join(cwd, ".picm"));
  await fs.writeFile(join(cwd, ".picm/config.json"), '{"version":1}\n');
  const realOpen = fs.open;
  let swapped = false;
  const swappingFs = {
    ...fs,
    async open(path, flags, mode) {
      const handle = await realOpen(path, flags, mode);
      if (!swapped && path === join(cwd, ".picm/config.json.lock")) {
        swapped = true;
        await fs.rename(join(cwd, ".picm"), join(cwd, ".picm-original"));
        await fs.symlink(join(cwd, ".picm-original"), join(cwd, ".picm"));
      }
      return handle;
    },
  };
  const result = await createMaintenanceConfigStore({ cwd, fs: swappingFs }).updateMaintenance(monthly);
  assert.equal(result.ok, false);
  assert.equal(result.code, "CONFIG_DIRECTORY_SYMLINK_BLOCKED");
  assert.equal(await fs.readFile(join(cwd, ".picm-original/config.json"), "utf8"), '{"version":1}\n');
});

test("rejects config substitution during the immediate pre-rename validation", async (t) => {
  const { cwd } = await repository(t);
  const path = join(cwd, ".picm/config.json");
  const outside = join(cwd, "outside.json");
  const original = '{"version":1}\n';
  await fs.mkdir(join(cwd, ".picm"));
  await fs.writeFile(path, original);
  await fs.writeFile(outside, '{"opaque":"external"}\n');
  let substituted = false;
  let configStats = 0;
  const substitutingFs = {
    ...fs,
    async lstat(candidate) {
      if (candidate === path && ++configStats === 3) {
        substituted = true;
        await fs.unlink(path);
        await fs.symlink(outside, path);
      }
      return fs.lstat(candidate);
    },
  };

  const result = await createMaintenanceConfigStore({ cwd, fs: substitutingFs }).updateMaintenance(monthly);
  assert.equal(result.ok, false);
  assert.equal(result.code, "CONFIG_SYMLINK_BLOCKED");
  assert.equal(await fs.readFile(path, "utf8"), '{"opaque":"external"}\n');
  assert.equal((await fs.readdir(join(cwd, ".picm"))).some((entry) => entry.includes(".tmp-")), false);
});

test("external opaque edits before publication return conflict without overwriting", async (t) => {
  const { cwd } = await repository(t);
  const path = join(cwd, ".picm/config.json");
  await fs.mkdir(join(cwd, ".picm"));
  await fs.writeFile(path, '{"version":1,"opaque":"original"}\n');
  let reads = 0;
  const store = createMaintenanceConfigStore({
    cwd,
    fs: {
      ...fs,
      async readFile(candidate, ...args) {
        if (candidate === path && ++reads === 3) {
          await fs.writeFile(path, '{"version":1,"opaque":"external"}\n');
        }
        return fs.readFile(candidate, ...args);
      },
    },
  });
  const result = await store.compareAndUpdateMaintenance(undefined, monthly);
  assert.equal(result.conflict, true);
  assert.equal(result.code, "CONFIG_CHANGED_BEFORE_WRITE");
  assert.equal(await fs.readFile(path, "utf8"), '{"version":1,"opaque":"external"}\n');
  assert.deepEqual(await fs.readdir(join(cwd, ".picm")), ["config.json"]);
});

test("pre-publication cancellation reports a potentially retained new directory", async (t) => {
  const { cwd } = await repository(t);
  const abort = new AbortController();
  let fileStats = 0;
  const path = join(cwd, ".picm/config.json");
  const store = createMaintenanceConfigStore({
    cwd,
    fs: {
      ...fs,
      async lstat(candidate) {
        if (candidate === path && ++fileStats === 2) abort.abort();
        return fs.lstat(candidate);
      },
    },
  });
  await assert.rejects(
    store.compareAndUpdateMaintenance(undefined, monthly, { signal: abort.signal }),
    (error) => error.code === "CONFIG_OPERATION_CANCELLED" && error.possibleCreatedDirectory === true && /may have been created and retained/.test(error.message),
  );
  await assert.rejects(fs.lstat(path), { code: "ENOENT" });
  assert.deepEqual(await fs.readdir(join(cwd, ".picm")), []);
});

test("two concurrent cycle completions atomically allow one update", async (t) => {
  const { cwd } = await repository(t);
  const due = createPolicy({ mode: "nudge", intervalValue: 1, intervalUnit: "days", now: "2026-01-01T00:00:00.000Z" });
  await fs.mkdir(join(cwd, ".picm"));
  await fs.writeFile(join(cwd, ".picm/config.json"), `${JSON.stringify({ version: 1, maintenance: due }, null, 2)}\n`);

  const stores = [
    createMaintenanceConfigStore({ cwd, randomId: () => "claim-one" }),
    createMaintenanceConfigStore({ cwd, randomId: () => "claim-two" }),
  ];
  let arrivals = 0;
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const controllers = stores.map((store) => createMaintenanceController({
    store: {
      ...store,
      async compareAndUpdateMaintenance(expected, next) {
        arrivals += 1;
        if (arrivals === 2) release();
        await barrier;
        return store.compareAndUpdateMaintenance(expected, next);
      },
    },
    now: () => new Date("2026-01-02T00:00:00.000Z"),
  }));

  const decisions = await Promise.all(controllers.map((controller) => controller.completeCycle()));
  assert.equal(decisions.filter((decision) => decision.ok && decision.changed).length, 1);
  const loser = decisions.find((decision) => decision.ok && !decision.changed);
  assert.equal(loser.conflict, true);
});

test("cycle completion cancellation before rename preserves the prior policy", async (t) => {
  const { cwd } = await repository(t);
  const path = join(cwd, ".picm/config.json");
  await fs.mkdir(join(cwd, ".picm"));
  await fs.writeFile(path, `${JSON.stringify({ version: 1, maintenance: monthly }, null, 2)}\n`);
  const abort = new AbortController();
  let configStats = 0;
  const abortingFs = {
    ...fs,
    async lstat(candidate) {
      if (candidate === path && ++configStats === 3) abort.abort();
      return fs.lstat(candidate);
    },
  };
  const controller = createMaintenanceController({
    store: createMaintenanceConfigStore({ cwd, fs: abortingFs }),
    now: () => new Date("2026-02-01T00:00:00.000Z"),
  });

  await assert.rejects(
    controller.completeCycle({ signal: abort.signal }),
    /CONFIG_OPERATION_CANCELLED/,
  );
  assert.deepEqual(JSON.parse(await fs.readFile(path, "utf8")).maintenance, monthly);
  assert.deepEqual(await fs.readdir(join(cwd, ".picm")), ["config.json"]);
});

test("cycle completion cancellation during rename keeps the committed policy", async (t) => {
  const { cwd } = await repository(t);
  const path = join(cwd, ".picm/config.json");
  await fs.mkdir(join(cwd, ".picm"));
  await fs.writeFile(path, `${JSON.stringify({ version: 1, maintenance: monthly }, null, 2)}\n`);
  const abort = new AbortController();
  let renames = 0;
  const renamingFs = {
    ...fs,
    async rename(from, to) {
      await fs.rename(from, to);
      renames += 1;
      if (from.includes(".tmp-")) abort.abort();
    },
  };
  const controller = createMaintenanceController({
    store: createMaintenanceConfigStore({ cwd, fs: renamingFs }),
    now: () => new Date("2026-02-01T00:00:00.000Z"),
  });

  const result = await controller.completeCycle({ signal: abort.signal });
  assert.equal(abort.signal.aborted, true);
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(result.committed, true);
  assert.equal(result.maintenance.lastCycleAt, "2026-02-01T00:00:00.000Z");
  assert.deepEqual(JSON.parse(await fs.readFile(path, "utf8")).maintenance, result.maintenance);
  assert.equal(renames, 1);
  assert.deepEqual(await fs.readdir(join(cwd, ".picm")), ["config.json"]);
});

test("cancellation during first config publication keeps the new file", async (t) => {
  const { cwd } = await repository(t);
  const abort = new AbortController();
  const store = createMaintenanceConfigStore({
    cwd,
    fs: {
      ...fs,
      async rename(from, to) {
        await fs.rename(from, to);
        abort.abort();
      },
    },
  });

  const result = await store.compareAndUpdateMaintenance(undefined, monthly, { signal: abort.signal });
  assert.equal(result.ok, true);
  assert.equal(result.committed, true);
  assert.deepEqual(JSON.parse(await fs.readFile(store.configPath, "utf8")).maintenance, monthly);
  assert.deepEqual(await fs.readdir(join(cwd, ".picm")), ["config.json"]);
});

for (const failure of ["sync", "close"]) {
  test(`cycle completion cancellation during directory ${failure} failure reports a committed policy`, async (t) => {
    const { cwd } = await repository(t);
    const path = join(cwd, ".picm/config.json");
    await fs.mkdir(join(cwd, ".picm"));
    await fs.writeFile(path, `${JSON.stringify({ version: 1, maintenance: monthly }, null, 2)}\n`);
    const abort = new AbortController();
    const abortingFs = {
      ...fs,
      async open(openPath, flags, mode) {
        const handle = await fs.open(openPath, flags, mode);
        if (openPath === join(cwd, ".picm") && flags === "r") {
          return {
            async sync() {
              if (failure === "sync") {
                abort.abort();
                throw new Error("synthetic directory sync failure");
              }
              await handle.sync();
            },
            async close() {
              await handle.close();
              if (failure === "close") {
                abort.abort();
                throw new Error("synthetic directory close failure");
              }
            },
          };
        }
        return handle;
      },
    };
    const controller = createMaintenanceController({
      store: createMaintenanceConfigStore({ cwd, fs: abortingFs }),
      now: () => new Date("2026-02-01T00:00:00.000Z"),
    });

    const result = await controller.completeCycle({ signal: abort.signal });
    assert.equal(result.ok, true);
    assert.equal(result.committed, true);
    assert.equal(result.code, "CONFIG_COMMITTED_SYNC_FAILED");
    assert.match(result.warning, new RegExp(`synthetic directory ${failure} failure`));
    assert.equal(result.maintenance.lastCycleAt, "2026-02-01T00:00:00.000Z");
    assert.deepEqual(JSON.parse(await fs.readFile(path, "utf8")).maintenance, result.maintenance);
    assert.deepEqual(await fs.readdir(join(cwd, ".picm")), ["config.json"]);
  });
}

test("late cancellation preserves an external replacement and leaves legacy rollback files alone", async (t) => {
  const { cwd } = await repository(t);
  const path = join(cwd, ".picm/config.json");
  const legacyPath = `${path}.rollback-legacy`;
  const original = `${JSON.stringify({ version: 1, maintenance: monthly }, null, 2)}\n`;
  const external = '{"version":7,"custom":"external replacement"}\n';
  await fs.mkdir(join(cwd, ".picm"));
  await fs.writeFile(path, original);
  await fs.writeFile(legacyPath, original);
  const abort = new AbortController();
  let rollbackLinks = 0;
  const replacingFs = {
    ...fs,
    async link(from, to) {
      if (to.includes(".rollback-")) rollbackLinks += 1;
      return fs.link(from, to);
    },
    async rename(from, to) {
      await fs.rename(from, to);
      if (from.includes(".tmp-")) {
        await fs.writeFile(`${path}.external`, external);
        await fs.rename(`${path}.external`, path);
        abort.abort();
      }
    },
  };
  const controller = createMaintenanceController({
    store: createMaintenanceConfigStore({ cwd, fs: replacingFs }),
    now: () => new Date("2026-02-01T00:00:00.000Z"),
  });

  const result = await controller.completeCycle({ signal: abort.signal });
  assert.equal(result.ok, true);
  assert.equal(result.committed, true);
  assert.equal(await fs.readFile(path, "utf8"), external);
  assert.equal(await fs.readFile(legacyPath, "utf8"), original);
  assert.equal(rollbackLinks, 0);
  assert.deepEqual((await fs.readdir(join(cwd, ".picm"))).sort(), ["config.json", "config.json.rollback-legacy"]);
});

test("lock cleanup failure after a cancelled commit does not undo the policy", async (t) => {
  const { cwd } = await repository(t);
  const path = join(cwd, ".picm/config.json");
  await fs.mkdir(join(cwd, ".picm"));
  await fs.writeFile(path, `${JSON.stringify({ version: 1, maintenance: monthly })}\n`);
  const abort = new AbortController();
  const controller = createMaintenanceController({
    store: createMaintenanceConfigStore({
      cwd,
        fs: {
        ...fs,
        async rename(from, to) {
          await fs.rename(from, to);
          if (from.includes(".tmp-")) abort.abort();
        },
        async unlink(target) {
          if (target === `${path}.lock`) throw new Error("synthetic lock cleanup failure");
          return fs.unlink(target);
        },
      },
    }),
    now: () => new Date("2026-02-01T00:00:00.000Z"),
  });

  const result = await controller.completeCycle({ signal: abort.signal });
  assert.equal(result.ok, true);
  assert.equal(result.committed, true);
  assert.deepEqual(JSON.parse(await fs.readFile(path, "utf8")).maintenance, result.maintenance);
  assert.deepEqual((await fs.readdir(join(cwd, ".picm"))).sort(), ["config.json", "config.json.lock"]);
});

test("post-rename directory sync failure reports a committed change", async (t) => {
  const { cwd } = await repository(t);
  await fs.mkdir(join(cwd, ".picm"));
  const path = join(cwd, ".picm/config.json");
  await fs.writeFile(path, '{"version":1}\n');
  const realOpen = fs.open;
  const failingSyncFs = {
    ...fs,
    async open(openPath, flags, mode) {
      const handle = await realOpen(openPath, flags, mode);
      if (openPath === join(cwd, ".picm") && flags === "r") {
        return {
          async sync() { throw new Error("synthetic directory sync failure"); },
          async close() { await handle.close(); },
        };
      }
      return handle;
    },
  };
  const result = await createMaintenanceConfigStore({ cwd, fs: failingSyncFs }).updateMaintenance(monthly);
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(result.committed, true);
  assert.equal(result.code, "CONFIG_COMMITTED_SYNC_FAILED");
  assert.match(result.warning, /directory sync failed/);
  assert.deepEqual(JSON.parse(await fs.readFile(path, "utf8")).maintenance, monthly);
});

test("lock or write failure leaves the prior file unchanged", async (t) => {
  const { cwd } = await repository(t);
  await fs.mkdir(join(cwd, ".picm"));
  const path = join(cwd, ".picm/config.json");
  const original = '{"version":1,"custom":"original"}\n';
  await fs.writeFile(path, original);
  await fs.writeFile(`${path}.lock`, "held");
  const locked = await createMaintenanceConfigStore({ cwd }).updateMaintenance(monthly);
  assert.equal(locked.code, "CONFIG_LOCKED");
  assert.equal(await fs.readFile(path, "utf8"), original);
  await fs.unlink(`${path}.lock`);

  const failingFs = { ...fs, rename: async () => { throw new Error("synthetic rename failure"); } };
  const failed = await createMaintenanceConfigStore({ cwd, fs: failingFs, randomId: () => "failure" }).updateMaintenance(monthly);
  assert.equal(failed.code, "CONFIG_WRITE_FAILED");
  assert.equal(await fs.readFile(path, "utf8"), original);
  await assert.rejects(fs.access(`${path}.lock`));
  await assert.rejects(fs.access(`${path}.tmp-${process.pid}-failure`));
});

test("recovers a dead-owner lock but never removes a live-owner lock", async (t) => {
  const { cwd } = await repository(t);
  await fs.mkdir(join(cwd, ".picm"));
  const path = join(cwd, ".picm/config.json");
  await fs.writeFile(path, `${JSON.stringify({ version: 1, maintenance: monthly })}\n`);
  const lockPath = `${path}.lock`;
  await fs.writeFile(lockPath, `${JSON.stringify({ pid: 41, token: "dead-owner" })}\n`);
  const recovered = await createMaintenanceConfigStore({
    cwd,
    processId: 99,
    isProcessAlive: (pid) => pid !== 41,
  }).updateMaintenance({ mode: "manual" });
  assert.equal(recovered.ok, true);
  await assert.rejects(fs.access(lockPath));

  await fs.writeFile(lockPath, `${JSON.stringify({ pid: 42, token: "live-owner" })}\n`);
  const blocked = await createMaintenanceConfigStore({
    cwd,
    processId: 99,
    isProcessAlive: () => true,
  }).updateMaintenance(monthly);
  assert.equal(blocked.code, "CONFIG_LOCKED");
  assert.deepEqual(JSON.parse(await fs.readFile(lockPath, "utf8")), { pid: 42, token: "live-owner" });
});

test("serializes concurrent stale-lock recovery without moving a replacement", async (t) => {
  const { cwd } = await repository(t);
  await fs.mkdir(join(cwd, ".picm"));
  const path = join(cwd, ".picm/config.json");
  await fs.writeFile(path, `${JSON.stringify({ version: 1, maintenance: monthly })}\n`);
  await fs.writeFile(`${path}.lock`, `${JSON.stringify({ pid: 41, token: "dead-owner" })}\n`);

  const first = createMaintenanceConfigStore({
    cwd,
    processId: 91,
    isProcessAlive: (pid) => pid !== 41,
  });
  const second = createMaintenanceConfigStore({
    cwd,
    processId: 92,
    isProcessAlive: (pid) => pid !== 41,
  });
  const results = await Promise.all([
    first.compareAndUpdateMaintenance(monthly, { mode: "manual" }),
    second.compareAndUpdateMaintenance(monthly, { mode: "manual" }),
  ]);

  assert.equal(results.filter((result) => result.changed).length, 1);
  assert.equal(results.filter((result) => result.conflict).length, 1);
  await assert.rejects(fs.access(`${path}.lock`));
  assert.equal((await fs.readdir(join(cwd, ".picm"))).some((entry) => entry.includes(".lock.recovery-")), false);
});

test("reclaims orphaned unique recovery links", async (t) => {
  const { cwd } = await repository(t);
  await fs.mkdir(join(cwd, ".picm"));
  const path = join(cwd, ".picm/config.json");
  const lockPath = `${path}.lock`;
  await fs.writeFile(path, `${JSON.stringify({ version: 1, maintenance: monthly })}\n`);
  await fs.writeFile(lockPath, `${JSON.stringify({ pid: 41, token: "dead-owner" })}\n`);
  await fs.link(lockPath, `${lockPath}.recovery-77-orphan`);

  const result = await createMaintenanceConfigStore({
    cwd,
    processId: 99,
    isProcessAlive: (pid) => pid !== 41,
  }).updateMaintenance({ mode: "manual" });

  assert.equal(result.ok, true);
  assert.equal((await fs.readdir(join(cwd, ".picm"))).some((entry) => entry.includes(".lock.recovery-")), false);
});

test("legacy opaque privacy objects remain readable and merge exclusions without data loss", async (t) => {
  const { cwd } = await repository(t);
  await fs.mkdir(join(cwd, ".picm"));
  const path = join(cwd, ".picm/config.json");
  const legacyPrivacy = { owner: "security-team", legacyMode: "private" };
  await fs.writeFile(path, `${JSON.stringify({ version: 1, custom: "keep", privacy: legacyPrivacy }, null, 2)}\n`);
  const store = createMaintenanceConfigStore({ cwd });

  assert.deepEqual(await store.readSettings(), {
    ok: true,
    exists: true,
    privacy: undefined,
  });
  const updated = await store.compareAndUpdatePrivacyExclusions(
    undefined,
    ["private", "private/nested"],
  );
  assert.equal(updated.ok, true);
  assert.equal(updated.changed, true);
  assert.deepEqual(JSON.parse(await fs.readFile(path, "utf8")), {
    version: 1,
    custom: "keep",
    privacy: {
      owner: "security-team",
      legacyMode: "private",
      excludedPaths: ["private"],
    },
  });
});

test("non-object and malformed privacy remain non-destructive errors", async (t) => {
  const nonObject = await repository(t);
  await fs.mkdir(join(nonObject.cwd, ".picm"));
  const path = join(nonObject.cwd, ".picm/config.json");
  const original = `${JSON.stringify({ version: 1, privacy: "security-owned" }, null, 2)}\n`;
  await fs.writeFile(path, original);
  const result = await createMaintenanceConfigStore(nonObject).readSettings();
  assert.equal(result.ok, false);
  assert.equal(result.code, "PRIVACY_LEGACY_MIGRATION_REQUIRED");
  assert.match(result.message, /migrate it explicitly/);
  assert.equal(await fs.readFile(path, "utf8"), original);

  const malformed = await repository(t);
  await fs.mkdir(join(malformed.cwd, ".picm"));
  await fs.writeFile(join(malformed.cwd, ".picm/config.json"), '{"privacy":{"excludedPaths":"secret"}}\n');
  assert.equal((await createMaintenanceConfigStore(malformed).readSettings()).code, "PRIVACY_EXCLUDED_PATHS_INVALID");
});
