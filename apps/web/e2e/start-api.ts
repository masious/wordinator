import { spawn } from "node:child_process";
import { resolve } from "node:path";
import setupDatabase from "./global-setup";

setupDatabase();

const apiDirectory = resolve(import.meta.dirname, "../../api");
const worker = spawn("pnpm", ["exec", "wrangler", "dev", "--persist-to", "../../.wrangler/e2e", "--port", "8788"], {
  cwd: apiDirectory,
  env: process.env,
  stdio: "inherit",
});

const stop = (signal: NodeJS.Signals) => {
  if (!worker.killed) worker.kill(signal);
};

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));
worker.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
