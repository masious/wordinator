import { readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const root = "content/dutch-foundations";
const generated = JSON.parse(await readFile(join(root, "dialogue-scenes.generated.json"), "utf8"));
let missingLocationAssets = {};
try { missingLocationAssets = JSON.parse(await readFile(join(root, "dialogue-scenes.missing-location-assets.json"), "utf8")); } catch {}
const blockBriefs = new Map(JSON.parse(await readFile(join(root, "dialogue-scenes.block-briefs.json"), "utf8")).briefs.map((brief) => [brief.blockId, brief]));
function* walk(blocks) {
  for (const block of blocks ?? []) {
    yield block;
    yield* walk(block.children);
  }
}
function speakers(block) {
  const raw = block?.props?.turns;
  const turns = typeof raw === "string" ? JSON.parse(raw) : raw;
  return Array.isArray(turns) ? [...new Set(turns.map((turn) => turn.speaker).filter(Boolean))] : [];
}
const rows = [];
for (const scene of generated.dialogues) {
  const [dir, slug] = scene.dialogueId.split("/");
  const doc = JSON.parse(await readFile(join(root, dir, `${slug}.json`), "utf8"));
  let blockIds = scene.dialogueBlockIds;
  if (!Array.isArray(blockIds)) {
    blockIds = [...walk(doc.blocks)].filter((block) => block.type === "dialogue").map((block) => block.id);
  }
  for (const blockId of blockIds) {
    const block = [...walk(doc.blocks)].find((entry) => entry.id === blockId);
    if (!block) throw new Error(`Missing dialogue block ${blockId} in ${scene.dialogueId}`);
    const brief = blockBriefs.get(blockId);
    const location = brief?.location ?? scene.location;
    const sharesLocation = location === scene.location;
    rows.push({ blockId, lessonId: scene.dialogueId, location, locationPrompt: sharesLocation ? scene.locationPrompt : `${location}, no people or readable text`, cast: speakers(block), sourceReference: sharesLocation ? scene.sourceReference : null, generatedAsset: sharesLocation ? scene.generatedAsset ?? null : null, lineScenePolicy: scene.lineScenePolicy });
  }
}
const briefs = {
  "21-a-zullen-we-sinterklaas-vieren": "Noor's Utrecht kitchen in winter evening light, dinner table and pepernoten bowl",
  "21-b-ik-haal-je-op": "Small Utrecht office desk with phone and calendar",
  "22-a-wat-ben-je-aan-het-doen": "Sofia's Lombok apartment table with cardboard bicycle craft and bell",
  "22-b-pakjesavond": "Cozy Utrecht flat dinner table on Sinterklaas evening",
  "23-a-mag-ik-vrij-nemen": "Utrecht office with blank leave calendar and laptop",
  "23-b-dat-hoeft-niet": "Sofia's kitchen table with phone messages",
  "24-a-wat-vind-jij-ervan": "Sofia's Lombok housewarming dinner table with shared dishes",
  "24-b-ik-denk-dat-het-gaat-sneeuwen": "Utrecht city library classroom after Dutch class",
  "25-wat-deed-je-gisteren": "Noor's familiar Utrecht kitchen on a winter morning",
  "26-waar-ben-je-heen-gegaan": "Sofia's Utrecht apartment kitchen table with an unlabeled city map",
  "27-wat-heb-je-gezien": "Utrecht home table with holiday photographs and tea",
  "28-toen-ik-jonger-was": "Warm Utrecht kitchen table for childhood memories",
  "29-eerst-daarna-uiteindelijk": "Sofia's Utrecht home with an unlabeled route map",
  "30-omdat-ik-werk": "Small Utrecht IT office with desks and blank screens",
  "31-want-of-omdat": "Utrecht city library classroom at evening class",
  "32-wat-is-het-leukst": "Warm home dining table with familiar dishes and unlabeled map",
  "33-de-collega-die-hier-werkt": "Utrecht office with computer, small card and wall picture",
  "34-om-te-studeren": "Quiet library table with open book, dictionary and notebook",
  "35-als-ik-tijd-had": "Utrecht cafe table with unlabeled park and pool map",
  "36-wat-gaan-we-morgen-doen": "Quiet library classroom with blank weekly timetable",
  "37-een-klein-probleem": "Ahmed's practical bicycle shop on Kanaalstraat",
  "38-de-dokter-en-de-balie": "Central library classroom used for role-play",
  "39-een-bericht-schrijven": "Kitchen table with phone and laptop showing blurred drafts",
  "40-sofia-vertelt-haar-verhaal": "Utrecht apartment kitchen table with softly blurred timeline notebook"
};
const lessonDirs = ["part-iv", "part-v", "part-vi", "part-vii"];
for (const dir of lessonDirs) {
  for (const name of await readdir(join(root, dir))) {
    if (!/\.json$/.test(name) || name === "course.json" || name === "course.prod.json") continue;
    const lessonId = name.replace(/\.json$/, "");
    if (!briefs[lessonId]) continue;
    const doc = JSON.parse(await readFile(join(root, dir, name), "utf8"));
    for (const block of doc.blocks ?? []) {
      if (block.type !== "dialogue") continue;
      const turns = Array.isArray(block.props?.turns) ? block.props.turns : [];
      const cast = [...new Set(turns.map((turn) => turn.speaker).filter(Boolean))];
      const azureKeys = ["22-b", "23-a", "23-b", "24-a", "24-b", "25", "26", "27", "28", "29", "30", "31", "32", "33", "34", "35", "36", "37", "38", "39", "40"];
      const candidateKeys = ["21-a", "21-b", "22-a"];
      const azureKey = azureKeys.find((key) => lessonId.startsWith(key));
      const generatedAsset = azureKey
        ? `illustrations/generated/azure/dialogue-scenes/${azureKey}/location.webp`
        : candidateKeys.some((key) => lessonId.startsWith(key))
          ? `illustrations/generated/azure/dialogue-scenes/${lessonId.slice(0, 4)}/location.webp`
          : null;
      rows.push({ blockId: block.id, lessonId: `${dir}/${lessonId}`, location: briefs[lessonId], locationPrompt: briefs[lessonId], cast, sourceReference: null, generatedAsset: generatedAsset ?? missingLocationAssets[briefs[lessonId]] ?? null, lineScenePolicy: "reuse location and portraits; one scene per line only when a gesture is authored" });
    }
  }
}
rows.sort((a, b) => a.lessonId.localeCompare(b.lessonId) || a.blockId.localeCompare(b.blockId));
const unique = new Map(rows.map((row) => [row.blockId, row]));
for (const row of unique.values()) if (row.generatedAsset == null && missingLocationAssets[row.location]) row.generatedAsset = missingLocationAssets[row.location];
for (const row of unique.values()) {
  row.portraitAssets = Object.fromEntries(row.cast.flatMap((speaker) => {
    const asset = `illustrations/generated/${speaker.toLowerCase().replace(/\s+/g, "-")}-portrait.webp`;
    return existsSync(join(root, asset)) ? [[speaker, asset]] : [];
  }));
}
const output = { version: 1, status: "local-staging", generatedAt: new Date().toISOString(), coverage: { dialogueBlocks: unique.size, lessons: new Set([...unique.values()].map((row) => row.lessonId)).size }, notes: ["One row per authored dialogue block (125 blocks across 62 lesson files).", "The legacy content/dutch-foundations/part-iii/existing/13-1.json block is excluded from the authored count.", "Generated assets are local paths only; no R2 objects are written by this manifest.", "Part I through part IV lesson briefs and generated assets are preserved from dialogue-scenes.generated.json.", "Part IV through part VII rows use explicit location and cast briefs; null generatedAsset means art is still pending."], dialogues: [...unique.values()] };
await writeFile(join(root, "dialogue-scenes.unified.json"), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify(output.coverage));
