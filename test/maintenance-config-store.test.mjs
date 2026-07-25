import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGitReadGate } from "../extensions/runtime/git-read-gate.mjs";
import { createMaintenanceConfigStore } from "../extensions/runtime/maintenance-config-store.mjs";
import { createMaintenanceController } from "../extensions/runtime/maintenance-controller.mjs";
import { createPolicy } from "../extensions/runtime/maintenance-policy.mjs";

async function repository(t, gitignore = "") {
  const cwd = await fs.mkdtemp(join(tmpdir(), "picm-maintenance-"));
  t.after(() => fs.rm(cwd, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q"], { cwd });
  await fs.writeFile(join(cwd, ".gitignore"), gitignore);
  const gate = createGitReadGate({ cwd, packageRoot: process.cwd() });
  return { cwd, gate };
}

const monthly = createPolicy({ mode: "nudge", intervalValue: 1, intervalUnit: "months", now: "2026-01-01T00:00:00.000Z" });

test("creates only minimal metadata plus explicitly set maintenance", async (t) => {
  const { cwd, gate } = await repository(t);
  const store = createMaintenanceConfigStore({ cwd, gate, randomId: () => "one" });
  const result = await store.updateMaintenance(monthly);
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(await fs.readFile(join(cwd, ".picm/config.json"), "utf8")), {
    version: 1,
    generatedBy: "picm-factory",
    maintenance: monthly,
  });
});

test("does not create a config for absent manual policy", async (t) => {
  const { cwd, gate } = await repository(t);
  const store = createMaintenanceConfigStore({ cwd, gate });
  assert.deepEqual(await store.updateMaintenance(undefined), { ok: true, changed: false, exists: false, maintenance: undefined });
  await assert.rejects(fs.access(join(cwd, ".picm/config.json")));
});

test("preserves unknown config fields and existing file mode", async (t) => {
  const { cwd, gate } = await repository(t);
  await fs.mkdir(join(cwd, ".picm"));
  const path = join(cwd, ".picm/config.json");
  await fs.writeFile(path, JSON.stringify({ version: 7, custom: { keep: true }, adoption: { status: "adopted" } }));
  await fs.chmod(path, 0o4640);
  const store = createMaintenanceConfigStore({ cwd, gate });
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

test("blocks ignored and symlink maintenance configs or directories", async (t) => {
  const ignored = await repository(t, ".picm/config.json\n");
  await fs.mkdir(join(ignored.cwd, ".picm"));
  await fs.writeFile(join(ignored.cwd, ".picm/config.json"), "{}\n");
  const ignoredResult = await createMaintenanceConfigStore(ignored).read();
  assert.equal(ignoredResult.ok, false);
  assert.equal(ignoredResult.code, "CONFIG_ACCESS_BLOCKED");

  const linked = await repository(t);
  await fs.mkdir(join(linked.cwd, ".picm"));
  await fs.writeFile(join(linked.cwd, "actual.json"), "{}\n");
  await fs.symlink(join(linked.cwd, "actual.json"), join(linked.cwd, ".picm/config.json"));
  const linkedResult = await createMaintenanceConfigStore(linked).read();
  assert.deepEqual(linkedResult, { ok: false, code: "CONFIG_SYMLINK_BLOCKED", message: "maintenance config must not be a symlink" });

  const linkedDirectory = await repository(t);
  await fs.mkdir(join(linkedDirectory.cwd, "actual-picm"));
  await fs.symlink(join(linkedDirectory.cwd, "actual-picm"), join(linkedDirectory.cwd, ".picm"));
  const linkedDirectoryResult = await createMaintenanceConfigStore(linkedDirectory).updateMaintenance(monthly);
  assert.equal(linkedDirectoryResult.ok, false);
  assert.equal(linkedDirectoryResult.code, "CONFIG_DIRECTORY_SYMLINK_BLOCKED");
});

test("revalidates .picm after taking the lock", async (t) => {
  const { cwd, gate } = await repository(t);
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
  const result = await createMaintenanceConfigStore({ cwd, gate, fs: swappingFs }).updateMaintenance(monthly);
  assert.equal(result.ok, false);
  assert.equal(result.code, "CONFIG_DIRECTORY_SYMLINK_BLOCKED");
  assert.equal(await fs.readFile(join(cwd, ".picm-original/config.json"), "utf8"), '{"version":1}\n');
});

test("revalidates Git ignore authorization under the lock", async (t) => {
  const { cwd, gate } = await repository(t);
  await fs.mkdir(join(cwd, ".picm"));
  const path = join(cwd, ".picm/config.json");
  const original = '{"version":1}\n';
  await fs.writeFile(path, original);
  let writeChecks = 0;
  const changingGate = {
    async checkPath(toolName, candidate) {
      if (toolName === "write" && ++writeChecks === 2) {
        await fs.writeFile(join(cwd, ".gitignore"), ".picm/config.json\n");
      }
      return gate.checkPath(toolName, candidate);
    },
  };
  const result = await createMaintenanceConfigStore({ cwd, gate: changingGate }).updateMaintenance(monthly);
  assert.equal(result.ok, false);
  assert.equal(result.code, "CONFIG_ACCESS_BLOCKED");
  assert.equal(await fs.readFile(path, "utf8"), original);
});

test("two concurrent startup probes atomically produce one automatic dispatch", async (t) => {
  const { cwd, gate } = await repository(t);
  const due = createPolicy({ mode: "automatic", intervalValue: 1, intervalUnit: "days", now: "2026-01-01T00:00:00.000Z" });
  await fs.mkdir(join(cwd, ".picm"));
  await fs.writeFile(join(cwd, ".picm/config.json"), `${JSON.stringify({ version: 1, maintenance: due }, null, 2)}\n`);

  const stores = [
    createMaintenanceConfigStore({ cwd, gate, randomId: () => "claim-one" }),
    createMaintenanceConfigStore({ cwd, gate, randomId: () => "claim-two" }),
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

  const decisions = await Promise.all(controllers.map((controller) => controller.startupProbe({ mode: "tui" })));
  assert.equal(decisions.filter((decision) => decision.action === "dispatch").length, 1);
  const loser = decisions.find((decision) => decision.action === "none");
  assert.equal(loser.reason, "already-claimed");
  assert.equal(loser.code, "MAINTENANCE_ALREADY_CLAIMED");
});

test("post-rename directory sync failure reports a committed change", async (t) => {
  const { cwd, gate } = await repository(t);
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
  const result = await createMaintenanceConfigStore({ cwd, gate, fs: failingSyncFs }).updateMaintenance(monthly);
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(result.committed, true);
  assert.equal(result.code, "CONFIG_COMMITTED_SYNC_FAILED");
  assert.match(result.warning, /directory sync failed/);
  assert.deepEqual(JSON.parse(await fs.readFile(path, "utf8")).maintenance, monthly);
});

test("lock or write failure leaves the prior file unchanged", async (t) => {
  const { cwd, gate } = await repository(t);
  await fs.mkdir(join(cwd, ".picm"));
  const path = join(cwd, ".picm/config.json");
  const original = '{"version":1,"custom":"original"}\n';
  await fs.writeFile(path, original);
  await fs.writeFile(`${path}.lock`, "held");
  const locked = await createMaintenanceConfigStore({ cwd, gate }).updateMaintenance(monthly);
  assert.equal(locked.code, "CONFIG_LOCKED");
  assert.equal(await fs.readFile(path, "utf8"), original);
  await fs.unlink(`${path}.lock`);

  const failingFs = { ...fs, rename: async () => { throw new Error("synthetic rename failure"); } };
  const failed = await createMaintenanceConfigStore({ cwd, gate, fs: failingFs, randomId: () => "failure" }).updateMaintenance(monthly);
  assert.equal(failed.code, "CONFIG_WRITE_FAILED");
  assert.equal(await fs.readFile(path, "utf8"), original);
  await assert.rejects(fs.access(`${path}.lock`));
  await assert.rejects(fs.access(`${path}.tmp-${process.pid}-failure`));
});

test("recovers a dead-owner lock but never removes a live-owner lock", async (t) => {
  const { cwd, gate } = await repository(t);
  await fs.mkdir(join(cwd, ".picm"));
  const path = join(cwd, ".picm/config.json");
  await fs.writeFile(path, `${JSON.stringify({ version: 1, maintenance: monthly })}\n`);
  const lockPath = `${path}.lock`;
  await fs.writeFile(lockPath, `${JSON.stringify({ pid: 41, token: "dead-owner" })}\n`);
  const recovered = await createMaintenanceConfigStore({
    cwd,
    gate,
    processId: 99,
    isProcessAlive: (pid) => pid !== 41,
  }).updateMaintenance({ mode: "manual" });
  assert.equal(recovered.ok, true);
  await assert.rejects(fs.access(lockPath));

  await fs.writeFile(lockPath, `${JSON.stringify({ pid: 42, token: "live-owner" })}\n`);
  const blocked = await createMaintenanceConfigStore({
    cwd,
    gate,
    processId: 99,
    isProcessAlive: () => true,
  }).updateMaintenance(monthly);
  assert.equal(blocked.code, "CONFIG_LOCKED");
  assert.deepEqual(JSON.parse(await fs.readFile(lockPath, "utf8")), { pid: 42, token: "live-owner" });
});
