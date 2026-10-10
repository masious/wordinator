// Story illustrations through Azure (Microsoft Foundry) FLUX.2 [pro] with multi-reference input. Run with apps/api/node_modules/.bin/tsx.
// Needs AZURE_FLUX_ENDPOINT and AZURE_FLUX_API_KEY, from the environment or illustrations/.dev.vars; nothing is deployed and no database is touched.
//   sheet <castId|locationId> [--count N]          reference-sheet candidates → illustrations/candidates/sheets/
//   freeze <castId|locationId> <candidate.jpg>     adopt a candidate as the frozen reference (refs/<id>.png)
//   scene <lesson.json> <imageIdeaIndex> [--count N]   scene candidates → illustrations/candidates/<lesson>/
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "illustrations");
const read = (name: string) => JSON.parse(readFileSync(join(root, name), "utf8"));

type Style = {
  endpointPath: string; model: string; prompt: string;
  scene: { width: number; height: number }; sheet: { width: number; height: number };
};
type Person = { name: string; label: string; appearance: string; outfit: string };
type Place = { name: string; description: string };
type ImageIdea = { afterHeading: string; description: string; alt: string; location?: string; characters?: string[]; action?: string };
type Request = { model: string; prompt: string; width: number; height: number; refs: string[] };

const style: Style = read("style.json");
const cast: Record<string, Person> = read("cast.json");
const places: Record<string, Place> = read("locations.json");

// FLUX.2 [pro] on Foundry accepts at most eight reference images.
const maxRefs = 8;
const refPath = (id: string) => join(root, "refs", `${id}.png`);

function sheetRequest(id: string): Request {
  const person = cast[id];
  if (person) return {
    model: style.model, ...style.sheet, refs: [],
    prompt: `${style.prompt} Character reference sheet: one single full-body figure standing, front view, relaxed friendly pose, arms by the sides, centred on a plain off-white background, nothing else in the picture. ${person.appearance} Outfit: ${person.outfit}`,
  };
  const place = places[id];
  if (place) return {
    model: style.model, ...style.scene, refs: [],
    prompt: `${style.prompt} Establishing shot of an empty location, no people. ${place.description}`,
  };
  throw new Error(`unknown cast or location id: ${id}`);
}

function sceneRequest(idea: ImageIdea): Request {
  if (!idea.location || !idea.characters?.length || !idea.action) throw new Error("imageIdea needs location, characters and action");
  const ids = [idea.location, ...idea.characters];
  if (ids.length > maxRefs) throw new Error(`at most ${maxRefs - 1} characters per scene`);
  for (const id of ids) if (!existsSync(refPath(id))) throw new Error(`no frozen reference for ${id}; run sheet + freeze first`);
  const place = places[idea.location];
  if (!place) throw new Error(`unknown location id: ${idea.location}`);
  // The BFL API numbers reference images from 1: the location is image 1, the characters images 2…n.
  const people = idea.characters.map((id, i) => {
    const person = cast[id];
    if (!person) throw new Error(`unknown cast id: ${id}`);
    return `${person.name} is ${person.label} from image ${i + 2}; keep her or his face, hair, accessories and outfit exactly as in image ${i + 2}. ${person.appearance} Outfit: ${person.outfit}`;
  });
  return {
    model: style.model, ...style.scene, refs: ids.map(refPath),
    prompt: `${style.prompt} The scene takes place in the room from image 1; keep its layout, furniture, window and colours exactly. ${place.description} ${people.join(" ")} ${idea.action} Exactly ${idea.characters.length} people in the picture; they use the room's existing furniture and nothing is added, so no extra chairs or objects; shown from the knees up or full body, same flat cartoon style as the reference images.`,
  };
}

function credentials() {
  const vars = join(root, ".dev.vars");
  if (existsSync(vars)) process.loadEnvFile(vars);
  const endpoint = process.env.AZURE_FLUX_ENDPOINT?.replace(/\/+$/, "");
  const key = process.env.AZURE_FLUX_API_KEY;
  if (!endpoint || !key) throw new Error(`set AZURE_FLUX_ENDPOINT and AZURE_FLUX_API_KEY (environment or ${vars})`);
  return { endpoint, key };
}

async function download(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`image download failed: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

type Result = {
  data?: { b64_json?: string; url?: string }[];
  result?: { sample?: string };
  polling_url?: string;
  status?: string;
};

// The response is either synchronous (base64 or a URL) or a BFL-style job with a polling URL.
async function imageFrom(result: Result, key: string): Promise<Buffer> {
  const item = result.data?.[0];
  if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
  if (item?.url) return download(item.url);
  if (result.result?.sample) return download(result.result.sample);
  if (result.polling_url) {
    for (let attempt = 0; attempt < 120; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const response = await fetch(result.polling_url, { headers: { Authorization: `Bearer ${key}` } });
      if (!response.ok) throw new Error(`polling failed: ${response.status} ${(await response.text()).slice(0, 300)}`);
      const job = await response.json() as Result;
      if (job.status === "Ready" && job.result?.sample) return download(job.result.sample);
      if (job.status && !["Pending", "Processing", "Queued", "Task not found"].includes(job.status)) {
        throw new Error(`generation ended with status ${job.status}: ${JSON.stringify(job).slice(0, 300)}`);
      }
    }
    throw new Error("generation timed out");
  }
  throw new Error(`no image in response: ${JSON.stringify(result).slice(0, 300)}`);
}

async function run(request: Request, outDir: string, stem: string, count: number) {
  const { endpoint, key } = credentials();
  mkdirSync(outDir, { recursive: true });
  const images = request.refs.map((path) => readFileSync(path).toString("base64"));
  // Continue numbering after earlier candidates so a rerun never overwrites them.
  let n = 1;
  while (existsSync(join(outDir, `${stem}-${n}.json`))) n++;
  for (const last = n + count - 1; n <= last; n++) {
    const seed = Math.floor(Math.random() * 2 ** 31);
    const body: Record<string, unknown> = {
      model: request.model, prompt: request.prompt, width: request.width, height: request.height,
      seed, output_format: "jpeg",
    };
    for (const [i, image] of images.entries()) body[i === 0 ? "input_image" : `input_image_${i + 1}`] = image;
    const started = Date.now();
    const response = await fetch(`${endpoint}${style.endpointPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`request failed: ${response.status} ${(await response.text()).slice(0, 500)}`);
    const image = await imageFrom(await response.json() as Result, key);
    const extension = image[0] === 0xff && image[1] === 0xd8 ? "jpg" : "png";
    const file = join(outDir, `${stem}-${n}.${extension}`);
    writeFileSync(file, image);
    writeFileSync(join(outDir, `${stem}-${n}.json`), `${JSON.stringify({ ...request, seed }, null, 2)}\n`);
    console.log(`${file} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  }
}

function freeze(id: string, candidate: string) {
  if (!cast[id] && !places[id]) throw new Error(`unknown cast or location id: ${id}`);
  mkdirSync(join(root, "refs"), { recursive: true });
  execFileSync("sips", ["-s", "format", "png", candidate, "--out", refPath(id)], { stdio: "ignore" });
  copyFileSync(candidate.replace(/\.(jpg|png)$/, ".json"), join(root, "refs", `${id}.json`));
  console.log(`froze ${id}: ${refPath(id)}`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const option = (name: string, fallback: number) => {
    const i = args.indexOf(name);
    return i >= 0 ? Number(args[i + 1]) : fallback;
  };

  if (command === "sheet" && args[0]) {
    await run(sheetRequest(args[0]), join(root, "candidates", "sheets"), args[0], option("--count", 3));
  } else if (command === "freeze" && args[0] && args[1]) {
    freeze(args[0], args[1]);
  } else if (command === "scene" && args[0] && args[1]) {
    const lesson = JSON.parse(readFileSync(args[0], "utf8")) as { imageIdeas?: ImageIdea[] };
    const index = Number(args[1]);
    const idea = lesson.imageIdeas?.[index];
    if (!idea) throw new Error(`no imageIdeas[${index}] in ${args[0]}`);
    await run(sceneRequest(idea), join(root, "candidates", basename(args[0], ".json")), `${index}-pro`, option("--count", 3));
  } else {
    console.error("usage: illustrate.ts sheet <id> [--count N] | freeze <id> <candidate.jpg> | scene <lesson.json> <index> [--count N]");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
