// Authoring tool for course lesson files. Run with apps/api/node_modules/.bin/tsx.
//   check <lesson.json...>  normalize authoring shorthand, assign missing block IDs (written back), validate, print feature usage
//   sql <partDir>           print local-D1 SQL that upserts the part's course, its lessons (as drafts) and practice anchors
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  findPublishProblems, flattenToSteps, lessonDocumentSchema, walkLessonBlocks, type LessonDocument,
} from "../../../packages/contracts/src/lessonDocument";
import { countBlanks, practicePayloadSchema } from "../../../packages/contracts/src/index";

type Json = any;
const textDefaults = { textColor: "default", backgroundColor: "default", textAlignment: "left" };

const inline = (content: Json): Json[] => {
  if (content == null) return [];
  if (typeof content === "string") return content ? [{ type: "text", text: content, styles: {} }] : [];
  return content.map((item: Json) =>
    typeof item === "string" ? { type: "text", text: item, styles: {} }
      : item.type === "link" ? { type: "link", href: item.href, content: inline(item.content) }
      : { type: "text", text: item.text, styles: item.styles ?? {} });
};

// Turns the authoring shorthand into the stored BlockNote shape. IDs are assigned on the authoring block so they persist.
const normalize = (block: Json): Json => {
  block.id ??= randomUUID();
  const props = block.props ?? {};
  const children = (block.children ?? []).map(normalize);
  switch (block.type) {
    case "paragraph": case "bulletListItem": case "numberedListItem":
      return { id: block.id, type: block.type, props: { ...textDefaults, ...props }, content: inline(block.content), children };
    case "heading":
      return { id: block.id, type: "heading", props: { ...textDefaults, level: 2, isToggleable: false, ...props }, content: inline(block.content), children };
    case "divider":
      return { id: block.id, type: "divider", props: {}, children: [] };
    case "callout":
      return { id: block.id, type: "callout", props: { variant: "hint", icon: "auto", ...props }, content: inline(block.content), children: [] };
    case "example":
      return { id: block.id, type: "example", props: { translation: props.translation ?? "", note: props.note ?? "" }, content: inline(block.content), children: [] };
    case "dialogue":
      return { id: block.id, type: "dialogue", props: { turns: typeof props.turns === "string" ? props.turns : JSON.stringify(props.turns) }, children: [] };
    case "practice": {
      const data = typeof props.data === "string" ? JSON.parse(props.data) : props.data;
      const payload = { instruction: data.instruction, passage: data.passage ?? null, items: data.items.map((item: Json) => ({ prompt: item.prompt, authorsVersion: item.authorsVersion ?? [], note: item.note ?? null })) };
      return { id: block.id, type: "practice", props: { data: JSON.stringify(payload) }, children: [] };
    }
    case "columnList":
      return { id: block.id, type: "columnList", props: {}, children };
    case "column":
      return { id: block.id, type: "column", props: { width: props.width ?? 1 }, children };
    default:
      return { ...block, children };
  }
};

type LessonFile = { id?: string; title: string; goal?: string | null; blocks: Json[] };

function load(path: string) {
  const file: LessonFile = JSON.parse(readFileSync(path, "utf8"));
  file.id ??= randomUUID();
  const document = { schemaVersion: 2, blocks: file.blocks.map(normalize) };
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

// course.json: { courseId, groupId, ownerId, positionOffset, create?: { title, summary, level, intendedLearner } }
function sql(dir: string) {
  const course = JSON.parse(readFileSync(join(dir, "course.json"), "utf8"));
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
  sql(args[0]!);
} else {
  console.error("usage: lesson.ts check <files...> | sql <partDir>");
  process.exit(2);
}
