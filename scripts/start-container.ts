import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const tsx = path.join(
  root,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsx.cmd" : "tsx",
);
const runtimeEnv: NodeJS.ProcessEnv = {
  ...process.env,
  HOSTNAME: "0.0.0.0",
};

process.stdout.write("==> Applying database migrations\n");
const migration = spawnSync(tsx, [path.join(root, "scripts", "migrate.ts")], {
  cwd: root,
  env: runtimeEnv,
  stdio: "inherit",
});
if (migration.error) throw migration.error;
if (migration.status !== 0) {
  throw new Error(`Database migrations failed with exit code ${migration.status ?? "unknown"}`);
}

process.stdout.write(`==> Starting web and worker on port ${runtimeEnv.PORT ?? "3000"}\n`);
const children = new Map<string, ChildProcess>();
let stopping = false;

function stop(exitCode: number, signal: NodeJS.Signals = "SIGTERM"): void {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  for (const child of children.values()) {
    if (child.exitCode === null && child.signalCode === null) child.kill(signal);
  }
  const forceKill = setTimeout(() => {
    for (const child of children.values()) {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }
  }, 10_000);
  forceKill.unref();
}

function supervise(name: string, command: string, args: string[]): ChildProcess {
  const child = spawn(command, args, {
    cwd: root,
    env: runtimeEnv,
    stdio: "inherit",
  });
  children.set(name, child);
  child.once("error", (error) => {
    process.stderr.write(`${name} process failed to start: ${String(error)}\n`);
    stop(1);
  });
  child.once("exit", (code, signal) => {
    if (stopping) return;
    process.stderr.write(
      `${name} process exited (code=${String(code)}, signal=${String(signal)})\n`,
    );
    stop(code ?? 1);
  });
  return child;
}

supervise("web", process.execPath, [path.join(root, "server.js")]);
supervise("worker", tsx, [path.join(root, "scripts", "worker.ts"), "--watch"]);

process.on("SIGINT", () => stop(0, "SIGINT"));
process.on("SIGTERM", () => stop(0, "SIGTERM"));
