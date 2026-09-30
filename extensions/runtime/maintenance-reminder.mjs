export function createMaintenanceReminder({ controllerForWorkspace } = {}) {
  if (typeof controllerForWorkspace !== "function") {
    throw new Error("Maintenance reminder requires a workspace controller");
  }

  const seen = new Map();

  async function offer({ cwd, mode, present }) {
    if (mode !== "tui") return { ok: true, action: "none", reason: "non-tui" };
    const controller = controllerForWorkspace(cwd);
    const probe = await controller.startupProbe({ mode });
    if (!probe.ok || probe.action !== "due") return probe;
    const key = probe.maintenance.nextDueAt;
    if (seen.get(cwd)?.has(key)) return { ok: true, action: "none", reason: "already-seen", dueKey: key };

    let keys = seen.get(cwd);
    if (!keys) {
      keys = new Set();
      seen.set(cwd, keys);
    }
    keys.add(key);
    try {
      const choice = await present(probe.maintenance);
      return { ok: true, action: choice === "run-now" ? "run-now" : "later", dueKey: key };
    } catch (error) {
      keys.delete(key);
      throw error;
    }
  }

  function reset() {
    seen.clear();
  }

  return { offer, reset };
}
