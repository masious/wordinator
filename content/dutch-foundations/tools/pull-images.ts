// TEMPORARY: delete this file, and its README row, once the content synchronization process is finished.
// Puts the image blocks of a database export into the lesson files, so a file holds the whole lesson and an import carries its images.
//   pull-images.ts <rows.json> <partDir...> [--write]
// <rows.json> is `wrangler d1 execute ... --json --command "SELECT id, draft_doc FROM course_lessons"` as is (or published_doc instead
// of draft_doc), or a bare array of rows. Each image goes under the same parent, after the non-image block it followed (see
// preserve-images.ts). Files with an `existing/` folder are read too. Dry run unless --write; touches no database.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { preserveImages } from "./preserve-images";

type Row = { id: string; draft_doc?: string; published_doc?: string };

function loadRows(path: string): Map<string, Row> {
  const text = readFileSync(path, "utf8");
  const start = text.indexOf("[");
  const end = text.indexOf("\n]", start);
  const parsed = JSON.parse(end < 0 ? text.slice(start) : text.slice(start, end + 2));
  const rows: Row[] = Array.isArray(parsed[0]?.results) ? parsed[0].results : parsed;
  return new Map(rows.map((row) => [row.id, row]));
}

const lessonFiles = (dir: string): string[] => [
  ...readdirSync(dir).filter((name) => name.endsWith(".json") && !name.startsWith("course")).map((name) => join(dir, name)),
  ...(existsSync(join(dir, "existing")) ? lessonFiles(join(dir, "existing")) : []),
];

const args = process.argv.slice(2);
const write = args.includes("--write");
const [rowsPath, ...dirs] = args.filter((arg) => !arg.startsWith("--"));
if (!rowsPath || dirs.length === 0) {
  console.error("usage: pull-images.ts <rows.json> <partDir...> [--write]");
  process.exit(2);
}
const rows = loadRows(rowsPath);
const seen = new Set<string>();
let added = 0, touched = 0, failed = 0;
for (const file of dirs.flatMap(lessonFiles)) {
  const lesson = JSON.parse(readFileSync(file, "utf8"));
  const row = lesson.id ? rows.get(lesson.id) : undefined;
  if (!row) { console.log(`no row   ${file}`); continue; }
  seen.add(row.id);
  const stored = JSON.parse(row.draft_doc ?? row.published_doc ?? "null");
  const merged = preserveImages(stored, { blocks: lesson.blocks });
  if (merged.problems.length > 0) { failed += 1; console.log(`PROBLEM  ${file}\n${merged.problems.map((p) => `  ${p}`).join("\n")}`); continue; }
  if (merged.renamed.length > 0) console.log(`renamed  ${file}\n${merged.renamed.map((r) => `  ${r}`).join("\n")}`);
  if (merged.preserved === 0) continue;
  added += merged.preserved; touched += 1;
  console.log(`+${String(merged.preserved).padStart(2)} images  ${file}`);
  if (write) writeFileSync(file, JSON.stringify({ ...lesson, blocks: merged.document.blocks }, null, 2) + "\n");
}
const orphans = [...rows.keys()].filter((id) => !seen.has(id));
console.log(`${write ? "wrote" : "would write"} ${added} images into ${touched} files; ${failed} files with problems; ${orphans.length} rows without a file in ${dirs.join(", ")}`);
process.exit(failed > 0 ? 1 : 0);
