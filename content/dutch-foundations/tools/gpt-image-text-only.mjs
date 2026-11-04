// Staging helper: text-only gpt-image generation for dialogue location plates.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [outDir, name, ...promptParts] = process.argv.slice(2);
if (!outDir || !name || promptParts.length === 0) throw new Error("usage: gpt-image-text-only.mjs <out-dir> <name> <prompt>");
const vars = Object.fromEntries((await readFile("apps/api/.dev.vars", "utf8")).split("\n").filter((line) => /^\s*[A-Z_0-9]+=/.test(line)).map((line) => { const i = line.indexOf("="); return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^['\"]|['\"]$/g, "")]; }));
const env = (key) => process.env[key] ?? vars[key];
const endpoint = env("AZURE_IMAGE_ENDPOINT");
const key = env("AZURE_IMAGE_API_KEY");
const model = env("AZURE_IMAGE_DEPLOYMENT") || "gpt-image-2";
if (!endpoint || !key) throw new Error("AZURE_IMAGE_ENDPOINT and AZURE_IMAGE_API_KEY are required");
const prompt = promptParts.join(" ");
const response = await fetch(`${new URL(endpoint).origin}/openai/v1/images/generations`, { method: "POST", headers: { "api-key": key, "content-type": "application/json" }, body: JSON.stringify({ model, prompt, size: "1536x864", quality: "medium", n: 1 }) });
const body = await response.json();
if (!response.ok) { console.error(JSON.stringify({ status: response.status, retryAfter: response.headers.get("retry-after"), body })); process.exit(1); }
const target = join("content/dutch-foundations/illustrations/generated/azure", outDir);
await mkdir(target, { recursive: true });
const file = join(target, `${name}.png`);
await writeFile(file, Buffer.from(body.data[0].b64_json, "base64"));
await writeFile(file.replace(/\.png$/, ".json"), JSON.stringify({ prompt, model, size: "1536x864", quality: "medium", usage: body.usage ?? {} }, null, 2));
console.log(file);
