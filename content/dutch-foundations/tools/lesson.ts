// Authoring tool for course lesson files. Run with apps/api/node_modules/.bin/tsx.
//   check <lesson.json...>  normalize authoring shorthand, assign missing block IDs (written back), validate, print feature usage
//   sql <partDir> [manifest] print D1 SQL that upserts the part's course, its lessons (as drafts) and practice anchors
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  collectLessonWords, findPublishProblems, flattenToSteps, lessonDocumentSchema, walkLessonBlocks, type LessonDocument,
} from "../../../packages/contracts/src/lessonDocument";
import { countBlanks, practicePayloadSchema } from "../../../packages/contracts/src/index";
import { authoredDocument } from "./normalize";

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

// course.json (or the manifest named on the command line, e.g. course.prod.json): { courseId, groupId, ownerId, positionOffset, create?: { title, summary, level, intendedLearner } }
function sql(dir: string, manifest: string) {
  const course = JSON.parse(readFileSync(join(dir, manifest), "utf8"));
  const now = Date.now();
  const out: string[] = [];
  if (course.create) {
    const c = course.create;
    out.push(`INSERT OR IGNORE INTO courses (id, group_id, owner_id, title, summary, level, intended_learner, cover_key, status, first_published_at, created_at, updated_at) VALUES (${q(course.courseId)}, ${q(course.groupId)}, ${q(course.ownerId)}, ${q(c.title)}, ${q(c.summary)}, ${q(c.level)}, ${q(c.intendedLearner)}, NULL, 'draft', NULL, ${now}, ${now});`);
  }
  const files = readdirSync(dir).filter((name) => /^\d.*\.json$/.test(name)).sort();
  files.forEach((name, index) => {
    if (!check(join(dir, name))) throw new Error(`${name} is invalid; fix it before generating SQL.`);
    const { file, document } = load(join(dir, name));
    const doc = JSON.stringify(lessonDocumentSchema.parse(document));
    const position = course.positionOffset + index;
    out.push(`INSERT INTO course_lessons (id, group_id, course_id, title, goal, position, draft_doc, draft_version, published_doc, published_at, created_by, updated_by, created_at, updated_at) VALUES (${q(file.id)}, ${q(course.groupId)}, ${q(course.courseId)}, ${q(file.title)}, ${q(file.goal ?? null)}, ${position}, ${q(doc)}, 1, NULL, NULL, ${q(course.ownerId)}, ${q(course.ownerId)}, ${now}, ${now}) ON CONFLICT(id) DO UPDATE SET title=excluded.title, goal=excluded.goal, position=excluded.position, draft_doc=excluded.draft_doc, draft_version=course_lessons.draft_version+1, updated_by=excluded.updated_by, updated_at=excluded.updated_at;`);
    for (const { block } of walkLessonBlocks(lessonDocumentSchema.parse(document).blocks)) {
      if (block.type === "practice") out.push(`INSERT OR IGNORE INTO course_practices (id, group_id, course_id, lesson_id, created_at) VALUES (${q(block.id)}, ${q(course.groupId)}, ${q(course.courseId)}, ${q(file.id)}, ${now});`);
    }
  });
  process.stdout.write(out.join("\n") + "\n");
}

const [command, ...args] = process.argv.slice(2);
if (command === "check") {
  const results = args.map(check);
  process.exit(results.every(Boolean) ? 0 : 1);
} else if (command === "sql") {
  sql(args[0]!, args[1] ?? "course.json");
} else {
  console.error("usage: lesson.ts check <files...> | sql <partDir>");
  process.exit(2);
}
