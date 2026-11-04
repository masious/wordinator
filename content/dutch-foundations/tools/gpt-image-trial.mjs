// Trial: gpt-image-2 edits from a picked production scene (docs/conversation-scenes.md#how). Not the canon pipeline yet.
// Run from the repository root:
//   node content/dutch-foundations/tools/gpt-image-trial.mjs location <scene.png> [--notes "what to keep or blank"]
//   node content/dutch-foundations/tools/gpt-image-trial.mjs portrait <scene.png> <cast id>
// Options for either job: --refs a.png,b.png adds reference images after the first; --out <dir> names a folder under
// candidates/gpt-image/. A location with --describe "place" draws that place, taking only the style from the references; a
// portrait with --person "who" draws someone not in cast.json (the cast id then only names the file).
//   node content/dutch-foundations/tools/gpt-image-trial.mjs scene <location.png> --refs <portraits> --describe "who does what"
//   node content/dutch-foundations/tools/gpt-image-trial.mjs mask <scene.png> <cast id> [--person "who"]
//   node content/dutch-foundations/tools/gpt-image-trial.mjs variant <scene.png> --describe "the one small change" [--name line-3]
// A scene places the referenced people in the location; a mask is the scene in flat greys with one person white, to multiply
// over the scene so everyone else dims; a variant redraws a scene with one small change, such as a gesture or a thought bubble.
// Reads AZURE_IMAGE_ENDPOINT, AZURE_IMAGE_API_KEY and AZURE_IMAGE_DEPLOYMENT from apps/api/.dev.vars. Each result lands in
// illustrations/candidates/gpt-image/ (gitignored) with a .json sidecar holding its prompt, references and token usage.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const [job, ref, ...rest] = process.argv.slice(2);
const castId = (job === "portrait" || job === "mask") && !rest[0]?.startsWith("--") ? rest.shift() : undefined;
const option = (name) => { const at = rest.indexOf(`--${name}`); return at < 0 ? "" : rest[at + 1] ?? ""; };
const notes = option("notes");
const refs = [ref, ...option("refs").split(",").filter(Boolean)];
if (!["location", "portrait", "scene", "mask", "variant"].includes(job) || !ref || ((job === "portrait" || job === "mask") && !castId) || ((job === "scene" || job === "variant") && !option("describe"))) {
  console.error("usage: gpt-image-trial.mjs location <scene.png> [--notes text] | portrait <scene.png> <cast id> | scene <location.png> --describe text | mask <scene.png> <cast id> | variant <scene.png> --describe text");
  process.exit(2);
}

const vars = Object.fromEntries(
  (await readFile("apps/api/.dev.vars", "utf8"))
    .split("\n").filter((line) => /^\s*[A-Z_0-9]+\s*=/.test(line))
    .map((line) => { const at = line.indexOf("="); return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^["']|["']$/g, "")]; }),
);
const env = (name) => process.env[name] ?? vars[name];
if (!env("AZURE_IMAGE_ENDPOINT") || !env("AZURE_IMAGE_API_KEY")) throw new Error("AZURE_IMAGE_ENDPOINT and AZURE_IMAGE_API_KEY are required");
const ill = "content/dutch-foundations/illustrations";

const style = "Keep exactly the illustration style of the reference images: the same warm painterly cartoon look, line quality, palette and lighting.";
const noText = "No text, letters, numbers or logos anywhere in the image.";

let spec;
if (job === "location") {
  const place = option("describe")
    ? `Draw this place as an empty establishing shot, in the same world as the reference images but not copying their rooms: ${option("describe")} No people at all.`
    : "Redraw the same place from the reference image as an empty establishing shot: the same room or street, view, furniture, season and light, but with no people at all. Slightly wider view,";
  spec = {
    size: "1536x864",
    prompt: `${style} ${place} Calm composition with the centre of the image less busy so text can sit on top of it. ${notes} ${noText}`.replace(/\s+/g, " "),
  };
} else if (job === "scene") {
  spec = {
    size: "1536x864",
    prompt: `${style} The first reference image is the place; keep it exactly: the same view, furniture, window and light. The other reference images are portraits of the people; keep their faces, hair, glasses and clothes exactly. ${option("describe")} Every person is clearly separate from the others, with a little space between them. ${notes} ${noText}`.replace(/\s+/g, " "),
  };
} else if (job === "variant") {
  spec = {
    size: "1536x864",
    prompt: `${style} Redraw the reference image as faithfully as possible: the same room, view, framing and light, and every person in the same place with the same face, hair, glasses and clothes. Make only this small change: ${option("describe")} Everything else stays exactly as it is. A thought bubble, if asked for, is a soft white cloud with a few small circles trailing down to the thinker's head, holding only a small picture. ${notes} ${noText}`.replace(/\s+/g, " "),
  };
} else if (job === "mask") {
  const cast = JSON.parse(await readFile(join(ill, "cast.json"), "utf8"));
  const label = option("person") || cast[castId]?.label;
  if (!label) throw new Error(`unknown cast id ${castId}`);
  spec = {
    size: "1536x864",
    prompt: `Make a mask of the reference image, not an illustration. Same size and framing as the reference, pixel-aligned with it. Fill the complete silhouette of ${label} (head, hair, body, clothes, arms and hands, including anything they hold) with flat pure white #FFFFFF. Fill everything else, the room, furniture, window and all other people, with flat mid grey #6E6E6E. Only those two flat colours: no shading, no outlines, no texture, no details. The white shape must sit exactly where that person is in the reference. ${notes}`.replace(/\s+/g, " "),
  };
} else {
  const cast = JSON.parse(await readFile(join(ill, "cast.json"), "utf8"));
  const person = option("person")
    ? { label: "a new character", appearance: option("person"), outfit: "as described." }
    : cast[castId];
  if (!person) throw new Error(`unknown cast id ${castId}`);
  const who = option("person")
    ? "a new character who appears in none of the reference images, drawn as if they belonged in them"
    : `${person.label} from the reference images, the same person with the same face, hair, glasses or no glasses, and clothes`;
  spec = {
    size: "1024x1024",
    prompt: `${style} Draw a head-and-shoulders portrait of ${who}. ${person.appearance} Wearing: ${person.outfit} Centred, facing the viewer at a slight three-quarter angle, friendly natural expression, the head filling about half the frame so it still reads when shown as a small circular avatar. Plain soft cream background with no objects. Only this one person. ${notes} ${noText}`.replace(/\s+/g, " "),
  };
}

const form = new FormData();
form.append("model", env("AZURE_IMAGE_DEPLOYMENT") || "gpt-image-2");
form.append("prompt", spec.prompt);
form.append("size", spec.size);
form.append("quality", "medium");
form.append("n", "1");
for (const file of refs) form.append("image[]", new Blob([await readFile(file)], { type: file.endsWith(".png") ? "image/png" : "image/jpeg" }), basename(file));

const started = Date.now();
const response = await fetch(`${new URL(env("AZURE_IMAGE_ENDPOINT")).origin}/openai/v1/images/edits`, {
  method: "POST", headers: { "api-key": env("AZURE_IMAGE_API_KEY") }, body: form,
});
const body = await response.json();
if (!response.ok) { console.error(response.status, JSON.stringify(body).slice(0, 600)); process.exit(1); }
const out = join(ill, "candidates/gpt-image", option("out"));
await mkdir(out, { recursive: true });
const file = join(out, option("name") ? `${option("name")}-${Date.now()}.png` : `${castId ? `${job}-${castId}` : job}-${basename(ref).replace(/\.\w+$/, "")}-${Date.now()}.png`);
await writeFile(file, Buffer.from(body.data[0].b64_json, "base64"));
await writeFile(file.replace(/\.png$/, ".json"), JSON.stringify({ references: refs, ...spec, usage: body.usage }, null, 2));
console.log(`${((Date.now() - started) / 1000).toFixed(0)}s`, file, JSON.stringify(body.usage ?? {}));
