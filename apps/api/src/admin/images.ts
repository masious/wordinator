import {
  ADMIN_IMAGES_PAGE_SIZE, adminImageFiltersResponseSchema, adminImagesResponseSchema,
  type AdminImage, type AdminImageKind, type AdminImageKindFilter,
} from "@wordinator/contracts/admin";
import { inlineText } from "@wordinator/contracts";
import { parseStoredLessonDocument, readDialogueTurns, walkLessonBlocks } from "@wordinator/contracts/lesson-document";
import { logInfo } from "../logger";
import { mediaUrlFromBase, storeImage, type ImageRefusal } from "../media";

// The superuser image library (docs/settings-and-administration.md#image-library): course covers, lesson image uploads, and
// dialogue scene assets in one newest-first list, and replacing one image everywhere it is used.

type ImageFilters = { kind?: AdminImageKindFilter; courseId?: string; lessonId?: string; usage?: "used" | "unused"; cursor?: { createdAt: number; key: string }; key?: string };
type ImageRow = {
  key: string; kind: AdminImageKind; courseId: string; lessonId: string | null; blockId: string | null; speaker: string | null; lineIndex: number | null;
  width: number | null; height: number | null; createdAt: number; inDraft: number; inPublished: number;
  courseSlug: string; courseTitle: string; courseStatus: AdminImage["course"]["status"];
  lessonSlug: string | null; lessonTitle: string | null; lessonPosition: number | null;
};

// A lesson image is used when a document holds its key; a dialogue asset when a document holds its block. Keys and block IDs
// are UUID-bearing JSON strings, so a quoted substring match is exact enough and far cheaper than walking the JSON.
const IMAGES = `WITH images AS (
    SELECT c.cover_key AS key, 'cover' AS kind, c.id AS courseId, NULL AS lessonId, NULL AS blockId, NULL AS speaker, NULL AS lineIndex,
      NULL AS width, NULL AS height, c.created_at AS createdAt, 1 AS inDraft, 1 AS inPublished
    FROM courses c WHERE c.cover_key IS NOT NULL
    UNION ALL
    SELECT m.key, 'lesson', m.course_id, m.lesson_id, NULL, NULL, NULL, NULL, NULL, m.created_at,
      instr(l.draft_doc, '"' || m.key || '"') > 0, COALESCE(instr(l.published_doc, '"' || m.key || '"') > 0, 0)
    FROM course_media m JOIN course_lessons l ON l.id = m.lesson_id
    UNION ALL
    SELECT d.key, d.kind, d.course_id, d.lesson_id, d.block_id, d.speaker, d.line_index, d.width, d.height, d.created_at,
      instr(l.draft_doc, '"' || d.block_id || '"') > 0, COALESCE(instr(l.published_doc, '"' || d.block_id || '"') > 0, 0)
    FROM dialogue_scene_images d JOIN course_lessons l ON l.id = d.lesson_id
  )
  SELECT i.*, c.slug AS courseSlug, c.title AS courseTitle, c.status AS courseStatus,
    l.slug AS lessonSlug, l.title AS lessonTitle, l.position AS lessonPosition
  FROM images i JOIN courses c ON c.id = i.courseId LEFT JOIN course_lessons l ON l.id = i.lessonId
  WHERE (?1 IS NULL OR i.kind = ?1 OR (?1 = 'dialogue' AND i.kind IN ('location', 'scene', 'mask', 'portrait')))
    AND (?2 IS NULL OR i.courseId = ?2) AND (?3 IS NULL OR i.lessonId = ?3)
    AND (?4 IS NULL OR (?4 = 'used') = (i.inDraft OR i.inPublished))
    AND (?5 IS NULL OR i.createdAt < ?5 OR (i.createdAt = ?5 AND i.key < ?6))
    AND (?7 IS NULL OR i.key = ?7)
  ORDER BY i.createdAt DESC, i.key DESC LIMIT ?8`;

type DialogueDetails = { section: string | null; turns: Array<{ speaker: string; text: string }> };
// The heading each dialogue sits under and its turns. Published content wins for shared blocks;
// draft-only blocks still need details while an author is preparing them.
async function readDialogues(db: D1Database, lessonIds: string[]) {
  const dialogues = new Map<string, DialogueDetails>();
  if (!lessonIds.length) return dialogues;
  const rows = await db.prepare("SELECT published_doc AS publishedDoc, draft_doc AS draftDoc FROM course_lessons WHERE id IN (SELECT value FROM json_each(?))")
    .bind(JSON.stringify([...new Set(lessonIds)])).all<{ publishedDoc: string | null; draftDoc: string }>();
  for (const row of rows.results) {
    for (const raw of [row.publishedDoc, row.draftDoc]) {
      if (!raw) continue;
      const document = parseStoredLessonDocument(JSON.parse(raw));
      if (!document) continue;
      let section: string | null = null;
      for (const { block } of walkLessonBlocks(document.blocks)) {
        if (block.type === "heading") section = inlineText(block.content).trim() || null;
        if (block.type !== "dialogue" || dialogues.has(block.id)) continue;
        try { dialogues.set(block.id, { section, turns: readDialogueTurns(block).map(({ speaker, text }) => ({ speaker, text })) }); }
        catch { dialogues.set(block.id, { section, turns: [] }); }
      }
    }
  }
  return dialogues;
}

async function readImages(env: Env, filters: ImageFilters, limit: number): Promise<AdminImage[]> {
  const rows = await env.DB.prepare(IMAGES).bind(
    filters.kind ?? null, filters.courseId ?? null, filters.lessonId ?? null, filters.usage ?? null,
    filters.cursor?.createdAt ?? null, filters.cursor?.key ?? null, filters.key ?? null, limit,
  ).all<ImageRow>();
  const dialogues = await readDialogues(env.DB, rows.results.flatMap((row) => row.blockId && row.lessonId ? [row.lessonId] : []));
  return rows.results.map((row) => {
    const dialogue = row.blockId ? dialogues.get(row.blockId) : undefined;
    return {
      key: row.key, url: mediaUrlFromBase(env.PUBLIC_MEDIA_BASE_URL, row.key)!, kind: row.kind, width: row.width, height: row.height, createdAt: row.createdAt,
      course: { id: row.courseId, slug: row.courseSlug, title: row.courseTitle, status: row.courseStatus },
      lesson: row.lessonId ? { id: row.lessonId, slug: row.lessonSlug!, title: row.lessonTitle!, position: row.lessonPosition! } : null,
      dialogue: row.blockId ? {
        blockId: row.blockId, speaker: row.speaker, lineIndex: row.lineIndex, section: dialogue?.section ?? null,
        line: row.lineIndex === null ? null : dialogue?.turns[row.lineIndex] ?? null,
      } : null,
      usedInDraft: Boolean(row.inDraft), usedInPublished: Boolean(row.inPublished),
    };
  });
}

export async function listImages(env: Env, filters: ImageFilters) {
  const images = await readImages(env, filters, ADMIN_IMAGES_PAGE_SIZE + 1);
  const page = images.slice(0, ADMIN_IMAGES_PAGE_SIZE);
  const last = page.at(-1);
  return adminImagesResponseSchema.parse({ images: page, nextCursor: images.length > ADMIN_IMAGES_PAGE_SIZE && last ? `${last.createdAt}|${last.key}` : null });
}

export async function imageFilters(db: D1Database) {
  const [courses, lessons] = await db.batch<{ id: string; title: string; courseId?: string; position?: number }>([
    db.prepare("SELECT id, title FROM courses ORDER BY title COLLATE NOCASE, id"),
    db.prepare("SELECT id, course_id AS courseId, title, position FROM course_lessons ORDER BY position, id"),
  ]);
  return adminImageFiltersResponseSchema.parse({
    courses: courses!.results.map((course) => ({
      id: course.id, title: course.title,
      lessons: lessons!.results.filter((lesson) => lesson.courseId === course.id).map(({ id, title, position }) => ({ id, title, position: position! })),
    })),
  });
}

type FoundImage = { kind: AdminImageKind; courseId: string; lessonId: string | null; blockId: string | null };
const FIND_IMAGE = `SELECT 'cover' AS kind, id AS courseId, NULL AS lessonId, NULL AS blockId FROM courses WHERE cover_key = ?1
  UNION ALL SELECT 'lesson', course_id, lesson_id, NULL FROM course_media WHERE key = ?1
  UNION ALL SELECT kind, course_id, lesson_id, block_id FROM dialogue_scene_images WHERE key = ?1 LIMIT 1`;

// Stores the new image beside the old one, points every record that used the old key at the new one in one batch, and only
// then deletes the old object. Lesson documents get the key swapped in both the draft and the published document, so a
// lesson whose draft matched its published document still does; a changed draft bumps the draft version, so an editor
// with the lesson open gets a conflict instead of saving the old key back. A lesson image keeps its upload time and a
// dialogue asset its slot, so the image keeps its place in the list.
export async function replaceImage(env: Env, userId: string, key: string, file: unknown): Promise<ImageRefusal | { error: "IMAGE_NOT_FOUND" } | { image: AdminImage; previousKey: string }> {
  const found = await env.DB.prepare(FIND_IMAGE).bind(key).first<FoundImage>();
  if (!found) return { error: "IMAGE_NOT_FOUND" };
  // The repository may not contain the current lesson text. Read both live cells before a lesson-image
  // replacement; the SQL below then replaces the key in the database's current values atomically.
  if (found.kind === "lesson") {
    const lesson = await env.DB.prepare("SELECT draft_doc, published_doc FROM course_lessons WHERE id = ?")
      .bind(found.lessonId).first<{ draft_doc: string; published_doc: string | null }>();
    if (!lesson) return { error: "IMAGE_NOT_FOUND" };
  }
  const lessonPrefix = `courses/${found.courseId}/lessons/${found.lessonId}`;
  const prefix = found.kind === "cover" ? "courses" : found.kind === "lesson" ? lessonPrefix : `${lessonPrefix}/dialogues/${found.blockId}/${found.kind}`;
  const stored = await storeImage(env.MEDIA, prefix, file);
  if ("error" in stored) return stored;
  const db = env.DB; const quotedOld = `"${key}"`; const quotedNew = `"${stored.key}"`;
  const statements = found.kind === "cover"
    ? [db.prepare("UPDATE courses SET cover_key = ? WHERE cover_key = ?").bind(stored.key, key)]
    : found.kind === "lesson"
      ? [
        db.prepare("INSERT INTO course_media (key, group_id, course_id, lesson_id, created_by, created_at) SELECT ?, group_id, course_id, lesson_id, ?, created_at FROM course_media WHERE key = ?")
          .bind(stored.key, userId, key),
        db.prepare(`UPDATE course_lessons SET draft_version = draft_version + (instr(draft_doc, ?1) > 0),
            draft_doc = replace(draft_doc, ?1, ?2), published_doc = replace(published_doc, ?1, ?2)
          WHERE (instr(draft_doc, ?1) > 0 OR instr(published_doc, ?1) > 0) AND EXISTS (SELECT 1 FROM course_media WHERE key = ?3)`).bind(quotedOld, quotedNew, stored.key),
        db.prepare("DELETE FROM course_media WHERE key = ? AND EXISTS (SELECT 1 FROM course_media WHERE key = ?)").bind(key, stored.key),
      ]
      : [db.prepare("UPDATE dialogue_scene_images SET key = ?, width = ?, height = ? WHERE key = ?").bind(stored.key, stored.width, stored.height, key)];
  let replaced: boolean;
  try { replaced = Boolean((await db.batch(statements))[0]!.meta.changes); }
  catch (error) { await env.MEDIA.delete(stored.key); throw error; }
  // The image was removed between the lookup and the batch, for example by the daily sweep.
  if (!replaced) { await env.MEDIA.delete(stored.key); return { error: "IMAGE_NOT_FOUND" }; }
  await env.MEDIA.delete(key);
  logInfo("admin_image.replaced", { kind: found.kind });
  const [image] = await readImages(env, { key: stored.key }, 1);
  return { image: image!, previousKey: key };
}
