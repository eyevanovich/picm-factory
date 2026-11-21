import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { readNamedDocument } from "../shared/runtime/named-document-read.ts";

async function main() {
  const [flag, root, ...extra] = process.argv.slice(2);
  if (flag !== "--root" || !root || extra.length || Number(process.versions.node.split(".")[0]) < 24) {
    throw new Error("INVALID_ARGUMENTS");
  }
  const controller = new AbortController();
  const cancel = () => { controller.abort(); process.stdin.destroy(); };
  process.on("SIGINT", cancel);
  process.on("SIGTERM", cancel);
  try {
    let input = "";
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) {
      controller.signal.throwIfAborted();
      input += chunk.toString();
      if (Buffer.byteLength(input) > 65536) throw new Error("INVALID_REQUEST");
    }
    const result = await readNamedDocument(root, JSON.parse(input), controller.signal);
    console.log(JSON.stringify(result));
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    if (!controller.signal.aborted) throw error;
    console.log(JSON.stringify(await readNamedDocument(root, undefined, controller.signal)));
    process.exitCode = 1;
  } finally {
    process.off("SIGINT", cancel);
    process.off("SIGTERM", cancel);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    await main();
  } catch {
    console.log(JSON.stringify({ ok: false, code: "READ_INVALID_REQUEST", message: "Use Node 24 and read-document.ts --root /absolute/workspace with a bounded JSON request on stdin." }));
    process.exitCode = 1;
  }
}
