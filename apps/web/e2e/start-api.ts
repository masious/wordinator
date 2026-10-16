import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { startAiStub } from "./aiStub";
import setupDatabase from "./global-setup";

setupDatabase();

const apiDirectory = resolve(import.meta.dirname, "../../api");
// An empty Azure key keeps lesson speech from calling Azure during browser tests, whatever `.dev.vars` holds. Media URLs point at
// the local worker's media route through the web origin: images left by earlier tests must never load from the production media
// domain, where a slow request keeps a page from going network-idle.
const apiPort = process.env.E2E_API_PORT || "8788";
const webPort = process.env.E2E_WEB_PORT || "5174";
const inspectorPort = String(Number(apiPort) + 1000);
// The tutor's only provider is the local stub (aiStub.ts), reached as Azure AI Foundry; global setup turns the other providers
// off, and the empty OpenRouter key keeps a key in `.dev.vars` from being used.
const aiStubPort = Number(apiPort) + 2000;
const aiStub = startAiStub(aiStubPort);
// The worker runs from a copy of its configuration without the Workers AI binding: that binding always reaches Cloudflare (and
// needs a wrangler login), while the stub is the only provider tests use. The copy sits beside the original so its relative paths
// and `.dev.vars` still resolve; it is git-ignored.
const config = JSON.parse(readFileSync(join(apiDirectory, "wrangler.jsonc"), "utf8")) as Record<string, unknown>;
delete config.ai;
writeFileSync(join(apiDirectory, "wrangler.e2e.json"), JSON.stringify(config, null, 2));
const worker = spawn("pnpm", ["exec", "wrangler", "dev", "--config", "wrangler.e2e.json", "--persist-to", "../../.wrangler/e2e", "--port", apiPort, "--inspector-port", inspectorPort,
  "--var", "AZURE_SPEECH_KEY:", "--var", "OPENROUTER_API_KEY:", "--var", `AZURE_AI_ENDPOINT:http://127.0.0.1:${aiStubPort}`, "--var", "AZURE_AI_KEY:e2e-stub",
  "--var", `PUBLIC_MEDIA_BASE_URL:http://127.0.0.1:${webPort}/api/media/`], {
  cwd: apiDirectory,
  env: process.env,
  stdio: "inherit",
});

const stop = (signal: NodeJS.Signals) => {
  aiStub.close();
  if (!worker.killed) worker.kill(signal);
};

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));
worker.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
