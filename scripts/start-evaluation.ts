import { spawn, spawnSync, type ChildProcess } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function runStep(name: string, args: string[]): void {
  console.log(`\n==> ${name}`);
  const result = spawnSync(npm, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0)
    throw new Error(`${name} failed with exit code ${result.status ?? "unknown"}`);
}

runStep("Database migrations", ["run", "db:migrate"]);
if (!process.argv.includes("--skip-build")) runStep("Production build", ["run", "build"]);

console.log("\n==> Starting web and durable worker. Press Ctrl+C to stop both.");
const web = spawn(npm, ["start"], { stdio: "inherit", env: process.env });
const worker = spawn(npm, ["run", "worker", "--", "--watch"], {
  stdio: "inherit",
  env: process.env,
});
let stopping = false;
function stop(children: ChildProcess[], exitCode: number): void {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  process.exitCode = exitCode;
}
process.on("SIGINT", () => stop([web, worker], 0));
process.on("SIGTERM", () => stop([web, worker], 0));
web.on("exit", (code) => stop([worker], code ?? 1));
worker.on("exit", (code) => stop([web], code ?? 1));
