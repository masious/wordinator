// Story illustrations through Workers AI (FLUX.2 multi-reference). Run with apps/api/node_modules/.bin/tsx.
// Uses wrangler's login (`wrangler login`); nothing is deployed and no database is touched.
//   sheet <castId|locationId> [--count N]          reference-sheet candidates → illustrations/candidates/sheets/
//   freeze <castId|locationId> <candidate.png>     adopt a candidate as the frozen reference (refs/<id>.png + refs/<id>.ref.png)
//   scene <lesson.json> <imageIdeaIndex> [--count N] [--final]   scene candidates → illustrations/candidates/<lesson>/
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "illustrations");
const read = (name: string) => JSON.parse(readFileSync(join(root, name), "utf8"));

type Style = {
  model: string; finalModel: string; prompt: string; refMaxSide: number;
  scene: { width: number; height: number }; sheet: { width: number; height: number };
};
type Person = { name: string; label: string; appearance: string; outfit: string };
type Place = { name: string; description: string };
type ImageIdea = { afterHeading: string; description: string; alt: string; location?: string; characters?: string[]; action?: string };
type Request = { model: string; prompt: string; width: number; height: number; refs: string[] };

const style: Style = read("style.json");
const cast: Record<string, Person> = read("cast.json");
const places: Record<string, Place> = read("locations.json");

const refPath = (id: string) => join(root, "refs", `${id}.ref.png`);

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

function sceneRequest(idea: ImageIdea, final: boolean): Request {
  if (!idea.location || !idea.characters?.length || !idea.action) throw new Error("imageIdea needs location, characters and action");
  const ids = [idea.location, ...idea.characters];
  for (const id of ids) if (!existsSync(refPath(id))) throw new Error(`no frozen reference for ${id}; run sheet + freeze first`);
  const place = places[idea.location];
  if (!place) throw new Error(`unknown location id: ${idea.location}`);
  const people = idea.characters.map((id, i) => {
    const person = cast[id];
    if (!person) throw new Error(`unknown cast id: ${id}`);
    return `${person.name} is ${person.label} from image ${i + 1}; keep her or his face, hair, accessories and outfit exactly as in image ${i + 1}. ${person.appearance} Outfit: ${person.outfit}`;
  });
  return {
    model: final ? style.finalModel : style.model, ...style.scene, refs: ids.map(refPath),
    prompt: `${style.prompt} The scene takes place in the room from image 0; keep its layout, furniture, window and colours exactly. ${place.description} ${people.join(" ")} ${idea.action} Exactly ${idea.characters.length} people in the picture; they use the room's existing furniture and nothing is added, so no extra chairs or objects; shown from the knees up or full body, same flat cartoon style as the reference images.`,
  };
}

async function run(request: Request, outDir: string, stem: string, count: number) {
  // ILLUSTRATE_WRANGLER_DIR points at a directory with a newer wrangler when the workspace one cannot open a remote session.
  const require = createRequire(join(process.env.ILLUSTRATE_WRANGLER_DIR ?? join(root, "..", "..", "..", "apps", "api"), "package.json"));
  const { getPlatformProxy } = require("wrangler") as typeof import("wrangler");
  const proxy = await getPlatformProxy<{ AI: Ai }>({ configPath: join(root, "wrangler.jsonc") });
  mkdirSync(outDir, { recursive: true });
  try {
    // Continue numbering after earlier candidates so a rerun never overwrites them.
    let n = 1;
    while (existsSync(join(outDir, `${stem}-${n}.json`))) n++;
    for (const last = n + count - 1; n <= last; n++) {
      const seed = Math.floor(Math.random() * 2 ** 31);
      const form = new FormData();
      form.append("prompt", request.prompt);
      form.append("width", String(request.width));
      form.append("height", String(request.height));
      form.append("seed", String(seed));
      for (const [i, path] of request.refs.entries()) {
        form.append(`input_image_${i}`, new Blob([readFileSync(path)], { type: "image/png" }), basename(path));
      }
      // Serializing through Response gives the multipart body and its boundary header.
      const body = new Response(form);
      const started = Date.now();
      const result = await proxy.env.AI.run(request.model as keyof AiModels, {
        multipart: { body: body.body, contentType: body.headers.get("content-type") ?? "multipart/form-data" },
      } as never) as { image?: string };
      if (!result?.image) throw new Error(`no image in response: ${JSON.stringify(result).slice(0, 300)}`);
      const image = Buffer.from(result.image, "base64");
      const extension = image[0] === 0xff && image[1] === 0xd8 ? "jpg" : "png";
      const file = join(outDir, `${stem}-${n}.${extension}`);
      writeFileSync(file, image);
      writeFileSync(join(outDir, `${stem}-${n}.json`), `${JSON.stringify({ ...request, seed }, null, 2)}\n`);
      console.log(`${file} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
    }
  } finally {
    await proxy.dispose();
  }
}

function freeze(id: string, candidate: string) {
  if (!cast[id] && !places[id]) throw new Error(`unknown cast or location id: ${id}`);
  mkdirSync(join(root, "refs"), { recursive: true });
  const full = join(root, "refs", `${id}.png`);
  execFileSync("sips", ["-s", "format", "png", candidate, "--out", full], { stdio: "ignore" });
  copyFileSync(candidate.replace(/\.(jpg|png)$/, ".json"), join(root, "refs", `${id}.json`));
  // FLUX.2 on Workers AI requires reference images smaller than 512×512.
  execFileSync("sips", ["-s", "format", "png", "-Z", String(style.refMaxSide), full, "--out", refPath(id)], { stdio: "ignore" });
  console.log(`froze ${id}: ${full}, ${refPath(id)}`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const flag = (name: string) => args.includes(name);
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
    const stem = `${index}-${flag("--final") ? "final" : "draft"}`;
    await run(sceneRequest(idea, flag("--final")), join(root, "candidates", basename(args[0], ".json")), stem, option("--count", 3));
  } else {
    console.error("usage: illustrate.ts sheet <id> [--count N] | freeze <id> <candidate.png> | scene <lesson.json> <index> [--count N] [--final]");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
