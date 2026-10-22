import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { evidenceReport } from "../shared/runtime/evidence-report.ts";

async function main() {
  const [flag, root, ...extra] = process.argv.slice(2);
  if (flag !== "--root" || !root || extra.length || Number(process.versions.node.split(".")[0]) < 24) {
    throw new Error("INVALID_ARGUMENTS");
  }
  const controller = new AbortController();
  const cancel = () => controller.abort();
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  try {
    let input = "";
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) {
      input += chunk.toString();
      if (Buffer.byteLength(input) > 65536) throw new Error("INVALID_REQUEST");
    }
    const result = await evidenceReport(root, JSON.parse(input), controller.signal);
    if (result.ok) process.stdout.write(result.report);
    else {
      console.log(JSON.stringify(result));
      process.exitCode = 1;
    }
  } finally {
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    await main();
  } catch {
    console.log(JSON.stringify({ ok: false, code: "INVALID_REQUEST", message: "Use Node 24 and report.ts --root /absolute/workspace with a bounded JSON request on stdin." }));
    process.exitCode = 1;
  }
}
