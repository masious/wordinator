#!/usr/bin/env node
// Import staged dialogue art. This is deliberately dry-run by default. --remote-check reads live D1
// without writing; only --apply uploads to R2 and inserts D1 rows. Wrangler output is never printed.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const MANIFEST = join(ROOT, "dialogue-scenes.unified.json");
const COURSE_PARTS = ["part-i", "part-ii", "part-iii", "part-iv", "part-v", "part-vi", "part-vii"];
const MAX_BYTES = 1_000_000;
const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const remoteCheck = apply || args.has("--remote-check");
const manifestPath = process.argv.find((value) => value.startsWith("--manifest="))?.slice("--manifest=".length) ?? MANIFEST;

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const sqlQuote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const walk = function* (blocks) { for (const block of blocks ?? []) { yield block; yield* walk(block.children); } };
const turnsOf = (block) => {
  const raw = block?.props?.turns;
  if (typeof raw === "string") return JSON.parse(raw);
  return raw ?? [];
};
const localPath = (value) => resolve(ROOT, value);
function dimensions(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const valid = (width, height) => width > 0 && height > 0 ? [width, height] : null;
  if (bytes.length >= 24 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) return valid(view.getUint32(16), view.getUint32(20));
  if (bytes.length >= 30 && bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70) {
    const chunk = new TextDecoder("latin1").decode(bytes.slice(12, 16));
    if (chunk === "VP8 " && bytes.length >= 30) return valid(view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff);
    if (chunk === "VP8X") return valid(1 + (bytes[24] | bytes[25] << 8 | bytes[26] << 16), 1 + (bytes[27] | bytes[28] << 8 | bytes[29] << 16));
    if (chunk === "VP8L" && bytes.length >= 25) return valid(1 + (((bytes[22] & 0x3f) << 8) | bytes[21]), 1 + (((bytes[24] & 0x0f) << 10) | (bytes[23] << 2) | ((bytes[22] & 0xc0) >> 6)));
  }
  return null;
}
const fail = (errors) => {
  if (!errors.length) return;
  console.error(`Preflight failed with ${errors.length} error(s):`);
  for (const error of errors.slice(0, 80)) console.error(`- ${error}`);
  if (errors.length > 80) console.error(`- …and ${errors.length - 80} more`);
  process.exitCode = 1;
};

function runWrangler(arguments_) {
  try {
    return execFileSync("pnpm", ["--filter", "@wordinator/api", "exec", "wrangler", ...arguments_], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const stderr = error && typeof error === "object" && "stderr" in error ? String(error.stderr) : "";
    const detail = stderr.match(/no such table: [\w_]+|SQLITE_ERROR|Authentication error|fetch failed/i)?.[0];
    throw new Error(`Wrangler ${arguments_.slice(0, 2).join(" ")} failed${detail ? `: ${detail}` : ""}.`);
  }
}
function parseWranglerJson(output) {
  const text = output.trim();
  try { return JSON.parse(text); } catch {}
  for (const start of [text.indexOf("["), text.indexOf("{")].filter((value) => value >= 0).sort((a, b) => a - b)) {
    try { return JSON.parse(text.slice(start)); } catch {}
  }
  throw new Error("Wrangler did not return JSON.");
}

const manifest = await readJson(manifestPath);
if (!Array.isArray(manifest.dialogues)) throw new Error("Manifest must contain a dialogues array.");
const courseByPart = new Map();
const localLessons = new Map();
for (const part of COURSE_PARTS) {
  const course = await readJson(join(ROOT, part, "course.prod.json"));
  courseByPart.set(part, course);
  const entries = await (await import("node:fs/promises")).readdir(join(ROOT, part));
  for (const name of await entries) {
    if (!name.endsWith(".json") || name === "course.prod.json" || name === "course.json") continue;
    const lesson = await readJson(join(ROOT, part, name));
    localLessons.set(`${part}/${name.slice(0, -5)}`, { ...lesson, part });
  }
}

const errors = [];
const assets = [];
for (const row of manifest.dialogues) {
  const lesson = localLessons.get(row.lessonId);
  if (!lesson) { errors.push(`${row.blockId}: missing local lesson ${row.lessonId}`); continue; }
  const block = [...walk(lesson.blocks)].find((candidate) => candidate.id === row.blockId && candidate.type === "dialogue");
  if (!block) { errors.push(`${row.blockId}: missing local dialogue block`); continue; }
  let turns;
  try { turns = turnsOf(block); } catch { errors.push(`${row.blockId}: invalid local dialogue turns`); continue; }
  const speakers = new Set(turns.map((turn) => String(turn.speaker).trim()));
  const add = async (kind, path, speaker = null, lineIndex = null) => {
    if (!path) return;
    const absolute = localPath(path);
    if (!existsSync(absolute)) { errors.push(`${row.blockId}: missing ${kind} asset ${path}`); return; }
    const bytes = await readFile(absolute); const digest = createHash("sha256").update(bytes).update(`\0${row.blockId}\0${kind}\0${speaker ?? ""}\0${lineIndex ?? ""}`).digest("hex").slice(0, 20);
    assets.push({ row, lesson, kind, speaker, lineIndex, path, absolute, bytes, digest, extension: extname(absolute).toLowerCase() || ".bin" });
  };
  await add("location", row.generatedAsset);
  for (const [speaker, path] of Object.entries(row.portraitAssets ?? {})) {
    if (!speakers.has(speaker.trim())) errors.push(`${row.blockId}: portrait speaker ${speaker} is not in dialogue`);
    await add("portrait", path, speaker.trim());
  }
  for (const [lineIndex, line] of (row.lineScenes ?? []).entries()) {
    if (!speakers.size || lineIndex >= turns.length) errors.push(`${row.blockId}: line scene ${lineIndex} is outside dialogue`);
    await add("scene", line.scene ?? line.scenePath, null, lineIndex);
    await add("mask", line.mask ?? line.maskPath, null, lineIndex);
  }
  const planned = new Set(Object.keys(row.portraitAssets ?? {}).map((speaker) => speaker.trim()));
  for (const speaker of speakers) if (!planned.has(speaker)) errors.push(`${row.blockId}: dialogue speaker ${speaker} has no portrait asset in plan`);
}
for (const asset of assets) {
  const size = asset.bytes.byteLength; const sizeInfo = dimensions(asset.bytes);
  if (!sizeInfo) errors.push(`${asset.row.blockId}: unrecognized image dimensions for ${asset.path}`);
  [asset.width, asset.height] = sizeInfo ?? [0, 0];
  if (size < 1 || size > MAX_BYTES) errors.push(`${asset.row.blockId}: ${asset.path} is ${size} bytes; uploads must be 1..${MAX_BYTES}`);
}
if (errors.length) fail(errors);
if (process.exitCode) process.exit();

let remoteLessons = [];
let existingRowsBySlot = new Map();
let imageTableReady = false;
if (remoteCheck) {
  const courseIds = [...new Set([...courseByPart.values()].map((course) => course.courseId))];
  const sql = `SELECT id, course_id AS courseId, group_id AS groupId, title, draft_doc AS draftDoc, published_doc AS publishedDoc FROM course_lessons WHERE course_id IN (${courseIds.map(sqlQuote).join(",")}) ORDER BY course_id, position, id`;
  try {
    const response = parseWranglerJson(runWrangler(["d1", "execute", "wordinator", "--remote", "--json", "--command", sql]));
    remoteLessons = Array.isArray(response) ? response.flatMap((item) => item.results ?? []) : response.results ?? [];
  }
  catch (error) { console.error(error instanceof Error ? error.message : "Remote lesson preflight failed"); process.exitCode = 1; process.exit(); }
  const remoteByKey = new Map();
  for (const lesson of remoteLessons) {
    const key = `${lesson.courseId}/${lesson.groupId}/${lesson.title}`;
    const matches = remoteByKey.get(key) ?? []; matches.push(lesson); remoteByKey.set(key, matches);
  }
  for (const row of manifest.dialogues) {
    const local = localLessons.get(row.lessonId); const course = courseByPart.get(local?.part);
    const matches = remoteByKey.get(`${course?.courseId}/${course?.groupId}/${local?.title}`) ?? [];
    if (matches.length !== 1) { errors.push(`${row.blockId}: expected one remote lesson for ${row.lessonId}, found ${matches.length}`); continue; }
    const remote = matches[0];
    const documents = [["published", remote.publishedDoc], ["draft", remote.draftDoc]].filter(([, document]) => document);
    let matchedDocument = false;
    for (const [label, document] of documents) {
      let block;
      try { block = [...walk(JSON.parse(document).blocks)].find((candidate) => candidate.id === row.blockId && candidate.type === "dialogue"); } catch { block = null; }
      if (!block) continue;
      matchedDocument = true;
      const turns = turnsOf(block); const speakers = new Set(turns.map((turn) => String(turn.speaker).trim()));
      const planned = new Set(Object.keys(row.portraitAssets ?? {}).map((speaker) => speaker.trim()));
      for (const speaker of speakers) if (!planned.has(speaker)) errors.push(`${row.blockId}: ${label} speaker ${speaker} has no portrait asset in plan`);
      for (const asset of assets.filter((item) => item.row.blockId === row.blockId)) {
        if (asset.speaker && !speakers.has(asset.speaker)) errors.push(`${row.blockId}: ${label} speaker slot ${asset.speaker} is absent`);
        if (asset.lineIndex !== null && asset.lineIndex >= turns.length) errors.push(`${row.blockId}: ${label} line ${asset.lineIndex} is absent`);
        asset.remote = remote;
      }
    }
    if (!matchedDocument) errors.push(`${row.blockId}: published and draft documents have no matching dialogue`);
  }
  if (errors.length) fail(errors);
  if (process.exitCode) process.exit();
  const tableSql = "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'dialogue_scene_images'";
  const tableResponse = parseWranglerJson(runWrangler(["d1", "execute", "wordinator", "--remote", "--json", "--command", tableSql]));
  imageTableReady = (Array.isArray(tableResponse) ? tableResponse.flatMap((item) => item.results ?? []) : tableResponse.results ?? []).length === 1;
  if (apply && !imageTableReady) throw new Error("Apply requires the dialogue_scene_images migration on remote D1.");
  if (imageTableReady) {
  const lessonIds = [...new Set(remoteLessons.map((lesson) => lesson.id))];
  const rowsSql = `SELECT lesson_id AS lessonId, block_id AS blockId, kind, speaker, line_index AS lineIndex, key FROM dialogue_scene_images WHERE lesson_id IN (${lessonIds.map(sqlQuote).join(",")})`;
  try {
    const response = parseWranglerJson(runWrangler(["d1", "execute", "wordinator", "--remote", "--json", "--command", rowsSql]));
    const existingRows = Array.isArray(response) ? response.flatMap((item) => item.results ?? []) : response.results ?? [];
    existingRowsBySlot = new Map(existingRows.map((row) => [`${row.lessonId}|${row.blockId}|${row.kind}|${row.speaker ?? ""}|${row.lineIndex ?? ""}`, row.key]));
  } catch (error) { console.error(error instanceof Error ? error.message : "Remote scene-row preflight failed"); process.exitCode = 1; process.exit(); }
  }
}
if (errors.length) fail(errors);
if (process.exitCode) process.exit();

const keyFor = (asset) => {
  const course = courseByPart.get(asset.lesson.part);
  const lessonId = asset.remote?.id ?? asset.row.lessonId;
  const slot = asset.kind === "portrait" ? `portrait/${encodeURIComponent(asset.speaker)}${asset.lineIndex == null ? "" : `/${asset.lineIndex}`}`
    : asset.lineIndex == null ? asset.kind : `${asset.kind}/${asset.lineIndex}`;
  return `courses/${course.courseId}/lessons/${lessonId}/dialogues/${asset.row.blockId}/${slot}-${asset.digest}${asset.extension}`;
};
const slotKey = (asset) => `${asset.remote.id}|${asset.row.blockId}|${asset.kind}|${asset.speaker ?? ""}|${asset.lineIndex ?? ""}`;
// The repository is not the sole source of lesson data. Preserve every existing scene slot, including
// images added through the editor or API after the local art was staged. This importer fills empty slots only.
const pendingAssets = remoteCheck ? assets.filter((asset) => !existingRowsBySlot.has(slotKey(asset))) : assets;
console.log(JSON.stringify({ mode: apply ? "apply" : remoteCheck ? "remote-check" : "dry-run", dialogues: manifest.dialogues.length, assets: assets.length, existingSlotsPreserved: remoteCheck && imageTableReady ? assets.length - pendingAssets.length : null, newSlots: remoteCheck ? pendingAssets.length : null, remotePreflight: remoteCheck, imageTableReady: remoteCheck ? imageTableReady : null, sampleKeys: assets.slice(0, 3).map(keyFor) }, null, 2));
if (!apply) process.exit();

const sleep = (ms) => new Promise((resolve_) => setTimeout(resolve_, ms));
for (const [index, asset] of pendingAssets.entries()) {
  const key = keyFor(asset);
  let lastError;
  for (let attempt = 0; attempt < 4; attempt++) {
    try { runWrangler(["r2", "object", "put", `wordinator-media/${key}`, `--file=${asset.absolute}`, "--remote", "--content-type", "image/" + (asset.extension === ".jpg" ? "jpeg" : asset.extension.slice(1))]); lastError = null; break; }
    catch (error) { lastError = error; await sleep(500 * 2 ** attempt); }
  }
  if (lastError) throw new Error(`R2 upload failed for ${asset.path}: ${lastError.message}`);
  console.error(`uploaded ${index + 1}/${pendingAssets.length}`);
}
const now = Date.now();
const values = pendingAssets.map((asset) => {
  const course = courseByPart.get(asset.lesson.part); const remote = asset.remote;
  return `(${sqlQuote(createHash("sha256").update(`${remote.id}\0${asset.row.blockId}\0${asset.kind}\0${asset.speaker ?? ""}\0${asset.lineIndex ?? ""}`).digest("hex").slice(0, 32))},${sqlQuote(remote.groupId ?? course.groupId)},${sqlQuote(course.courseId)},${sqlQuote(remote.id)},${sqlQuote(asset.row.blockId)},${sqlQuote(asset.kind)},${asset.speaker == null ? "NULL" : sqlQuote(asset.speaker)},${asset.lineIndex == null ? "NULL" : asset.lineIndex},${sqlQuote(keyFor(asset))},${asset.width},${asset.height},${sqlQuote(course.ownerId)},${now})`;
});
if (values.length) {
  const sql = `INSERT INTO dialogue_scene_images (id,group_id,course_id,lesson_id,block_id,kind,speaker,line_index,key,width,height,created_by,created_at) VALUES ${values.join(",")} ON CONFLICT DO NOTHING;`;
  const temp = join("/tmp", `wordinator-dialogue-scenes-${process.pid}.sql`);
  await writeFile(temp, sql);
  try { runWrangler(["d1", "execute", "wordinator", "--remote", `--file=${temp}`]); }
  finally { await unlink(temp).catch(() => {}); }
}
console.log(`Imported up to ${pendingAssets.length} new dialogue scene assets; preserved ${assets.length - pendingAssets.length} existing slots.`);
