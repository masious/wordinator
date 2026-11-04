// Authoring tool for course lesson files. Run with apps/api/node_modules/.bin/tsx.
//   check <lesson.json...>  normalize authoring shorthand, assign missing block IDs (written back), validate, print feature usage
//   sql <partDir> [manifest] [--existing=<rows.json>]
//                           print D1 SQL that inserts the part's course, its new lessons (as drafts) and practice anchors; with the
//                           target's stored drafts, also updates existing lessons and keeps their in-app images (see `sql` below)
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import {
  collectLessonWords, findPublishProblems, flattenToSteps, lessonDocumentSchema, walkLessonBlocks, type LessonDocument,
} from "../../../packages/contracts/src/lessonDocument";
import { countBlanks, practicePayloadSchema, slugify } from "../../../packages/contracts/src/index";
import { authoredWordMarksSchema, resolveWordMarks } from "../../../packages/contracts/src/wordMarks";
import { authoredDocument } from "./normalize";
import { preserveImages } from "./preserve-images";

// Authored word marks (tools/word-marks.ts, docs/courses.md#word-marks) live beside the lessons as word-marks/<lesson file name>.
// word-marks.ts runs its CLI on import, so the path rule is repeated here.
const marksPath = (lessonFile: string) => join(dirname(new URL(import.meta.url).pathname), "..", "word-marks", basename(lessonFile));

type Json = any;

type LessonFile = { id?: string; title: string; goal?: string | null; blocks: Json[] };

function load(path: string) {
  const file: LessonFile = JSON.parse(readFileSync(path, "utf8"));
  file.id ??= crypto.randomUUID();
  const document = authoredDocument(file.blocks);
  writeFileSync(path, JSON.stringify(file, null, 2) + "\n");
  return { file, document };
}

function check(path: string): boolean {
  const { file, document } = load(path);
  const errors: string[] = [];
  if (!file.title || file.title.length > 200) errors.push("title missing or over 200 characters");
  if (file.goal && file.goal.length > 2000) errors.push("goal over 2000 characters");
  const parsed = lessonDocumentSchema.safeParse(document);
  if (!parsed.success) for (const issue of parsed.error.issues.slice(0, 20)) errors.push(`${issue.path.join(".")}: ${issue.message}`);
  const stats: Record<string, number> = {};
  const bump = (key: string, by = 1) => { stats[key] = (stats[key] ?? 0) + by; };
  if (parsed.success) {
    const doc: LessonDocument = parsed.data;
    for (const problem of findPublishProblems(doc)) errors.push(`publish: ${problem.blockId} ${problem.problem}`);
    for (const { block } of walkLessonBlocks(doc.blocks)) {
      bump(block.type);
      if (block.type === "heading") bump(`heading.h${block.props.level}`);
      if (block.type === "callout") bump(`callout.${block.props.variant}`);
      if ("content" in block && Array.isArray(block.content)) for (const item of block.content) {
        if (item.type === "link") bump("inline.link");
        else {
          if (item.styles.bold) bump("inline.bold");
          if (item.styles.italic) bump("inline.italic");
          if (item.styles.textColor) bump("inline.textColor");
          if (item.styles.backgroundColor) bump("inline.backgroundColor");
        }
      }
      if (block.type === "practice") {
        const payload = practicePayloadSchema.parse(JSON.parse(block.props.data));
        if (payload.passage) bump("practice.reading");
        for (const item of payload.items) {
          bump("practice.items");
          bump(countBlanks(item.prompt) > 0 ? "practice.items.fill" : "practice.items.open");
          if (item.authorsVersion.length === 0) bump("practice.items.noAuthorsVersion");
        }
      }
      if (block.type === "dialogue") bump("dialogue.turns", JSON.parse(block.props.turns).length);
      if (block.type === "vocabulary") bump("vocabulary.words", JSON.parse(block.props.data).words.length);
    }
    // Each term once per lesson (trimmed, case-insensitive), as in the course recap.
    const seen = new Set<string>();
    for (const word of collectLessonWords(doc)) {
      const key = word.term.trim().toLowerCase();
      if (seen.has(key)) errors.push(`vocabulary: "${word.term}" appears more than once`);
      seen.add(key);
    }
    stats["player.steps"] = flattenToSteps(doc).length;
    stats["bytes"] = new TextEncoder().encode(JSON.stringify(doc)).length;
  }
  console.error(`${errors.length ? "FAIL" : "OK  "} ${path} — ${file.title}`);
  for (const error of errors) console.error(`  ✗ ${error}`);
  if (parsed.success) console.error("  " + Object.entries(stats).sort().map(([key, value]) => `${key}=${value}`).join(" "));
  return errors.length === 0;
}

const q = (value: unknown) => value == null ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`;

// The title's slug, or the slug with a short ID suffix when another row in the scope already uses it (docs/courses.md#readable-urls).
// Upserts never change an existing row's slug, so links stay valid when a title is edited.
const slugSql = (table: "courses" | "course_lessons", scope: [column: string, value: string], id: string, title: string, fallback: string) => {
  const base = slugify(title) || fallback;
  const suffixed = `${base.slice(0, 53).replace(/-+$/, "")}-${id.replace(/-/g, "").slice(0, 6)}`;
  return `(SELECT CASE WHEN EXISTS (SELECT 1 FROM ${table} WHERE ${scope[0]} = ${q(scope[1])} AND slug = ${q(base)} AND id <> ${q(id)}) THEN ${q(suffixed)} ELSE ${q(base)} END)`;
};

// Stored drafts of the target database, from `wrangler d1 execute ... --json --command "SELECT id, draft_doc, draft_version FROM
// course_lessons WHERE course_id = '<courseId>'"` (its output as is: Wrangler may print warnings after the JSON, which ends at the
// first line that starts with "]"), or a bare array of rows.
type StoredLesson = { id: string; draft_doc: string; draft_version: number };
function loadExisting(path: string): Map<string, StoredLesson> {
  const text = readFileSync(path, "utf8");
  const start = text.indexOf("[");
  const end = text.indexOf("\n]", start);
  const parsed = JSON.parse(end < 0 ? text.slice(start) : text.slice(start, end + 2));
  const rows: StoredLesson[] = Array.isArray(parsed[0]?.results) ? parsed[0].results : parsed;
  for (const row of rows) if (typeof row.id !== "string" || typeof row.draft_doc !== "string" || typeof row.draft_version !== "number") {
    throw new Error(`${path}: every row needs id, draft_doc and draft_version`);
  }
  return new Map(rows.map((row) => [row.id, row]));
}

// course.json (or the manifest named on the command line, e.g. course.prod.json): { courseId, groupId, ownerId, positionOffset, create?: { title, summary, level, intendedLearner } }
// A lesson missing from the database is inserted as a draft. A lesson already there is left alone, unless `existing` holds its
// stored draft: then its draft is replaced by the file's document with the stored draft's image blocks kept, and only while
// the draft version is still the exported one and the lesson is in the manifest's course. Everything else edited in the app is
// replaced by the file.
function sql(dir: string, manifest: string, existing: Map<string, StoredLesson> | null) {
  const course = JSON.parse(readFileSync(join(dir, manifest), "utf8"));
  const now = Date.now();
  const out: string[] = [];
  const counts = { inserted: 0, updated: 0, images: 0 };
  if (course.create) {
    const c = course.create;
    out.push(`INSERT OR IGNORE INTO courses (id, slug, group_id, owner_id, title, summary, level, intended_learner, cover_key, status, first_published_at, created_at, updated_at) VALUES (${q(course.courseId)}, ${slugSql("courses", ["group_id", course.groupId], course.courseId, c.title, "course")}, ${q(course.groupId)}, ${q(course.ownerId)}, ${q(c.title)}, ${q(c.summary)}, ${q(c.level)}, ${q(c.intendedLearner)}, NULL, 'draft', NULL, ${now}, ${now});`);
  }
  const files = readdirSync(dir).filter((name) => /^\d.*\.json$/.test(name)).sort();
  files.forEach((name, index) => {
    if (!check(join(dir, name))) throw new Error(`${name} is invalid; fix it before generating SQL.`);
    const { file, document } = load(join(dir, name));
    const parsedDocument = lessonDocumentSchema.parse(document);
    let wordMarks: string | null = null;
    const marksFile = marksPath(name);
    if (existsSync(marksFile)) {
      const { marks, problems } = resolveWordMarks(parsedDocument, authoredWordMarksSchema.parse(JSON.parse(readFileSync(marksFile, "utf8"))).marks);
      if (problems.length) throw new Error(`${name}: word marks do not resolve:\n${problems.map((problem) => `  ${problem}`).join("\n")}`);
      wordMarks = JSON.stringify(marks);
    }
    const position = course.positionOffset + index;
    // One comment line per lesson, so a file too big for one `wrangler d1 execute` can be split by lesson.
    out.push(`-- lesson ${file.id} ${name}`);
    const stored = existing?.get(file.id!);
    let written: string;
    if (stored) {
      const kept = preserveImages(JSON.parse(stored.draft_doc), parsedDocument);
      if (kept.problems.length) throw new Error(`${name}: stored images cannot be placed:\n${kept.problems.map((problem) => `  ${problem}`).join("\n")}`);
      const merged = lessonDocumentSchema.safeParse(kept.document);
      if (!merged.success) throw new Error(`${name}: with its ${kept.preserved} stored images the lesson is invalid: ${merged.error.issues.map((issue) => issue.message).join("; ")}`);
      out.push(`UPDATE course_lessons SET title=${q(file.title)}, goal=${q(file.goal ?? null)}, position=${position}, draft_doc=${q(JSON.stringify(merged.data))}, draft_version=draft_version+1, updated_by=${q(course.ownerId)}, updated_at=${now} WHERE id=${q(file.id)} AND course_id=${q(course.courseId)} AND draft_version=${stored.draft_version};`);
      written = `draft_version = ${stored.draft_version + 1} AND updated_at = ${now}`;
      counts.updated += 1; counts.images += kept.preserved;
    } else {
      out.push(`INSERT INTO course_lessons (id, slug, group_id, course_id, title, goal, position, draft_doc, draft_version, published_doc, published_at, created_by, updated_by, created_at, updated_at) VALUES (${q(file.id)}, ${slugSql("course_lessons", ["course_id", course.courseId], file.id!, file.title, "lesson")}, ${q(course.groupId)}, ${q(course.courseId)}, ${q(file.title)}, ${q(file.goal ?? null)}, ${position}, ${q(JSON.stringify(parsedDocument))}, 1, NULL, NULL, ${q(course.ownerId)}, ${q(course.ownerId)}, ${now}, ${now}) ON CONFLICT(id) DO NOTHING;`);
      written = `created_at = ${now}`;
      counts.inserted += 1;
    }
    // `written` matches only a row this run wrote, so a lesson left alone keeps its marks and gets no anchors for practices it
    // does not hold. The marks are a separate statement: the document and its marks together can exceed D1's statement size limit.
    out.push(`UPDATE course_lessons SET word_marks = ${q(wordMarks)} WHERE id = ${q(file.id)} AND ${written};`);
    for (const { block } of walkLessonBlocks(parsedDocument.blocks)) {
      if (block.type === "practice") out.push(`INSERT OR IGNORE INTO course_practices (id, group_id, course_id, lesson_id, created_at) SELECT ${q(block.id)}, ${q(course.groupId)}, ${q(course.courseId)}, ${q(file.id)}, ${now} WHERE EXISTS (SELECT 1 FROM course_lessons WHERE id = ${q(file.id)} AND ${written});`);
    }
  });
  process.stdout.write(out.join("\n") + "\n");
  console.error(`${counts.inserted} lessons inserted only if new, ${counts.updated} updated with ${counts.images} stored images kept.` +
    (existing ? "" : " Lessons already in the database are left unchanged; pass --existing=<rows.json> to update them."));
}

const [command, ...args] = process.argv.slice(2);
if (command === "check") {
  const results = args.map(check);
  process.exit(results.every(Boolean) ? 0 : 1);
} else if (command === "sql") {
  const existing = args.find((arg) => arg.startsWith("--existing="))?.slice("--existing=".length);
  const [dir, manifest] = args.filter((arg) => !arg.startsWith("--"));
  sql(dir!, manifest ?? "course.json", existing ? loadExisting(existing) : null);
} else {
  console.error("usage: lesson.ts check <files...> | sql <partDir> [manifest] [--existing=<rows.json>]");
  process.exit(2);
}
