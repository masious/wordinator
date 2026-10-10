import { spawn } from "node:child_process";
import { resolve } from "node:path";
import setupDatabase from "./global-setup";

setupDatabase();

const apiDirectory = resolve(import.meta.dirname, "../../api");
// An empty Azure key keeps lesson speech from calling Azure during browser tests, whatever `.dev.vars` holds. Media URLs point at
// the local worker's media route through the web origin: images left by earlier tests must never load from the production media
// domain, where a slow request keeps a page from going network-idle.
const apiPort = process.env.E2E_API_PORT || "8788";
const webPort = process.env.E2E_WEB_PORT || "5174";
const inspectorPort = String(Number(apiPort) + 1000);
const worker = spawn("pnpm", ["exec", "wrangler", "dev", "--persist-to", "../../.wrangler/e2e", "--port", apiPort, "--inspector-port", inspectorPort,
  "--var", "AZURE_SPEECH_KEY:", "--var", `PUBLIC_MEDIA_BASE_URL:http://127.0.0.1:${webPort}/api/media/`], {
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
