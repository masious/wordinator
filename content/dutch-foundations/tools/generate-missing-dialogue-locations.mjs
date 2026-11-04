import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { join } from "node:path";

const run = promisify(execFile);
const root = "content/dutch-foundations";
const manifestPath = join(root, "dialogue-scenes.unified.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const locations = [...new Set(manifest.dialogues.filter((row) => row.generatedAsset == null).map((row) => row.location))].sort();
const vars = Object.fromEntries((await readFile("apps/api/.dev.vars", "utf8")).split("\n").filter((line) => /^\s*[A-Z_0-9]+=/.test(line)).map((line) => { const i = line.indexOf("="); return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^['\"]|['\"]$/g, "")]; }));
const env = (key) => process.env[key] ?? vars[key];
const endpoint = env("AZURE_IMAGE_ENDPOINT");
const key = env("AZURE_IMAGE_API_KEY");
const model = env("AZURE_IMAGE_DEPLOYMENT") || "gpt-image-2";
if (!endpoint || !key) throw new Error("AZURE_IMAGE_ENDPOINT and AZURE_IMAGE_API_KEY are required");
const slug = (value) => value.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const outDir = join(root, "illustrations/generated/azure/missing-locations");
await mkdir(outDir, { recursive: true });
const map = {};
for (const location of locations) {
  const name = slug(location);
  const png = join(outDir, `${name}.png`);
  const webp = join(outDir, `${name}.webp`);
  const asset = `illustrations/generated/azure/missing-locations/${name}.webp`;
  map[location] = asset;
  try { await readFile(webp); console.log("exists", location, asset); continue; } catch {}
  const prompt = `Warm painterly cartoon illustration in the established Dutch Foundations style. Empty establishing shot of ${location}. No people. Calm central negative space for lesson text. No text, letters, numbers, logos, labels, or watermark.`;
  let attempt = 0;
  while (true) {
    const response = await fetch(`${new URL(endpoint).origin}/openai/v1/images/generations`, { method: "POST", headers: { "api-key": key, "content-type": "application/json" }, body: JSON.stringify({ model, prompt, size: "1536x864", quality: "medium", n: 1 }) });
    const body = await response.json();
    if (response.ok) {
      await writeFile(png, Buffer.from(body.data[0].b64_json, "base64"));
      await run("cwebp", ["-quiet", "-q", "82", png, "-o", webp]);
      console.log("generated", location, asset);
      break;
    }
    if (response.status !== 429 || attempt >= 2) throw new Error(`${response.status} for ${location}: ${JSON.stringify(body)}`);
    const wait = Math.max(1000, Number(response.headers.get("retry-after") || 30) * 1000 + 1000);
    attempt += 1;
    console.log(`429 for ${location}; waiting ${Math.round(wait / 1000)}s (retry ${attempt}/2)`);
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}
await writeFile(join(root, "dialogue-scenes.missing-location-assets.json"), `${JSON.stringify(map, null, 2)}\n`);
console.log(JSON.stringify({ locations: locations.length, assets: Object.keys(map).length }));
