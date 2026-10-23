import {
  activityAnswerRequestSchema, activityAnswerResponseSchema, activityDescriptorListResponseSchema, activityOpenRequestSchema,
  activityOpenResponseSchema, activityRunPatchRequestSchema, activityRunPatchResponseSchema, activitySpeechRequestSchema,
  activitySpeechResponseSchema, activityStatusResponseSchema, dialogueSpeakers, gradeLessonActivityAnswer, lessonActivityPayloadSchema,
  lessonActivityViewSchema, readerLines, resolveLessonActivitySources, toLessonActivityView, verifyLessonActivitySource,
  type ActivityCompletion, type ActivityDescriptor, type ActivityType, type LessonActivityPayload,
} from "@wordinator/contracts/lesson-activities";
import { flattenToSteps, lessonStepKey, readDialogueTurns, walkLessonBlocks, type LessonBlockOf, type LessonDocument } from "@wordinator/contracts/lesson-document";
import { dialogueVoices, speechClipHash } from "@wordinator/contracts/speech";
import type { Context, Hono, MiddlewareHandler } from "hono";
import { aiErrorResponse, assertDailySpeechCap, completeChat, readAiSettings, recordSpeechUsage } from "../ai";
import type { AppEnvironment } from "../app";
import { apiError, parseJson } from "../http";
import { azureSynthesizer, clipUrl, onDemandClip, readClips, storedSpeechCast } from "../speech";
import { activitySourceBlocks, activitySourceData, generateLessonActivity, materializeActivity, type GenerationTrace } from "./generate";
import { completeIfWhole, saveLessonPosition } from "../learning/progress";
import { completedActivities, metricsSnapshot, parseMetricsSnapshot, readActivityMetrics } from "./metrics";
import { speechChunks } from "./speech";
import { claimGeneration, commitGeneratedPayload, LESSON_ACTIVITY_LEASE_MS, LESSON_ACTIVITY_RETRY_MS, releaseCacheMiss, reserveCacheMiss, type CacheRow } from "./cache";

type ActivityContext = Context<AppEnvironment>;
export type ActivityLesson = {
  groupId: string; courseId: string; lessonId: string; archived: boolean; language: "nl" | "de"; title: string; goal: string | null;
  publishedAt: number; document: LessonDocument;
};
type RouteDeps = {
  requireActivityAccess: MiddlewareHandler<AppEnvironment>;
  lessonFor: (context: ActivityContext) => Promise<{ error: Response } | ActivityLesson>;
};

const PATH = "/api/courses/:courseId/lessons/:lessonId/activities";
const RETRY_MS = 1_000;
const cacheColumns = `id, lesson_id AS lessonId, course_id AS courseId, source_id AS sourceId, activity_type AS activityType,
  source_fingerprint AS sourceFingerprint, recipe_version AS recipeVersion, schema_version AS schemaVersion, language, cache_key AS cacheKey,
  status, lease_token AS leaseToken, lease_expires_at AS leaseExpiresAt, next_attempt_at AS nextAttemptAt, payload, generated_by AS generatedBy`;
type RunRow = { id: string; activityId: string; userId: string; cursor: number; reader: string | null; status: "active" | "completed"; startedAt: number; updatedAt: number; completedAt: number | null };
const runColumns = `id, activity_id AS activityId, user_id AS userId, cursor, reader, status, started_at AS startedAt, updated_at AS updatedAt, completed_at AS completedAt`;
const userId = (context: ActivityContext) => context.get("user")!.id;
const idHash = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
const activityType = (value: string) => value as ActivityType;
// The shared run schema has no activity or account fields: the response carries only the learner's own run state.
const presentRun = (row: RunRow, ephemeral = false) => ({
  id: row.id, cursor: row.cursor, reader: row.reader, status: row.status, startedAt: row.startedAt, updatedAt: row.updatedAt, completedAt: row.completedAt, ephemeral,
});

async function readActivity(db: D1Database, id: string) {
  return db.prepare(`SELECT ${cacheColumns} FROM lesson_activities WHERE id=?`).bind(id).first<CacheRow>();
}
async function currentSource(lesson: ActivityLesson, sourceId: string, type: ActivityType) {
  const descriptors = await resolveLessonActivitySources({ document: lesson.document, title: lesson.title, includeLessonEnd: true });
  const found = descriptors.find((item) => item.sourceId === sourceId && item.activityTypes.includes(type));
  if (!found) return { descriptors, descriptor: null };
  return { descriptors, descriptor: verifyLessonActivitySource(descriptors, sourceId, type, found.fingerprint) };
}
async function cacheKey(lesson: ActivityLesson, sourceId: string, type: ActivityType, fingerprint: string) {
  return idHash(JSON.stringify([lesson.lessonId, sourceId, type, fingerprint, 1, 1, lesson.language]));
}
// A new run snapshots the four lesson metrics, so completion can report what the activity moved.
async function ensureRun(db: D1Database, activityId: string, uid: string, now: number, snapshot: () => Promise<string>): Promise<RunRow> {
  const existing = await db.prepare(`SELECT ${runColumns} FROM lesson_activity_runs WHERE activity_id=? AND user_id=?`).bind(activityId, uid).first<RunRow>();
  if (existing) return existing;
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO lesson_activity_runs (id,activity_id,user_id,cursor,reader,status,started_at,updated_at,completed_at,metrics_before)
    VALUES (?,?,?,0,NULL,'active',?,?,NULL,?) ON CONFLICT(activity_id,user_id) DO NOTHING`).bind(id, activityId, uid, now, now, await snapshot()).run();
  return (await db.prepare(`SELECT ${runColumns} FROM lesson_activity_runs WHERE activity_id=? AND user_id=?`).bind(activityId, uid).first<RunRow>())!;
}
function validPayload(row: CacheRow): LessonActivityPayload | null {
  if (!row.payload) return null;
  try { const parsed = lessonActivityPayloadSchema.safeParse(JSON.parse(row.payload)); return parsed.success && parsed.data.type === row.activityType ? parsed.data : null; }
  catch { return null; }
}
// Answerable items in the order the run cursor walks them. Answers store these IDs as item_id. Read aloud walks the run reader's
// lines (every line without one); review words has none, since its drill grades words through word memory instead.
function activityItemIds(payload: LessonActivityPayload, reader: string | null): string[] {
  if (payload.type === "tricky_grammar" || payload.type === "mixed_practice") return payload.questions.map((question) => question.id);
  if (payload.type === "guided_grammar") return payload.steps.map((step) => step.question.id);
  if (payload.type === "read_aloud") return readerLines(payload.lines, reader).map((line) => line.id);
  return [];
}
// A guided grammar step is the lesson text the learner just read: its first answer credits reading up to the step's last block.
// The saved position only moves forward (never back), nothing is written when the block is no longer published, and the lesson
// then completes by its normal rule.
async function creditGuidedReading(db: D1Database, uid: string, lesson: ActivityLesson, payload: LessonActivityPayload, itemId: string) {
  if (payload.type !== "guided_grammar") return;
  const lastId = payload.steps.find((step) => step.question.id === itemId)?.blocks.at(-1)?.id;
  const block = lastId === undefined ? undefined : [...walkLessonBlocks(lesson.document.blocks)].map((entry) => entry.block).find((candidate) => candidate.id === lastId);
  if (!block) return;
  const ids = new Set([...walkLessonBlocks([block])].map((entry) => entry.block.id));
  const steps = flattenToSteps(lesson.document);
  let index = -1;
  steps.forEach((step, at) => { if ("blocks" in step ? step.blocks.some((candidate) => ids.has(candidate.id)) : ids.has(step.block.id)) index = at; });
  if (index < 0) return;
  const target = { groupId: lesson.groupId, courseId: lesson.courseId, lessonId: lesson.lessonId, userId: uid };
  const saved = await db.prepare("SELECT step_index AS stepIndex FROM course_lesson_positions WHERE lesson_id = ? AND user_id = ?").bind(lesson.lessonId, uid).first<{ stepIndex: number }>();
  if (!saved || saved.stepIndex < index) await saveLessonPosition(db, target, steps, index, lessonStepKey(steps[index]!));
  await completeIfWhole(db, target, lesson.document);
}
function sourcePayload(row: CacheRow, descriptor: { sourceId: string; sourceLabel: string }, payload: LessonActivityPayload) {
  return lessonActivityViewSchema.parse(toLessonActivityView({ id: row.id, sourceId: descriptor.sourceId, sourceLabel: descriptor.sourceLabel, sourceFingerprint: row.sourceFingerprint, generatedBy: row.generatedBy, payload }));
}

export function registerLessonActivityRoutes(app: Hono<AppEnvironment>, deps: RouteDeps) {
  const getLesson = async (context: ActivityContext) => deps.lessonFor(context);
  app.get(PATH, deps.requireActivityAccess, async (context) => {
    const found = await getLesson(context); if ("error" in found) return found.error;
    const descriptors = await resolveLessonActivitySources({ document: found.document, title: found.title, includeLessonEnd: true });
    const completed = await completedActivities(context.env.DB, found, userId(context), descriptors);
    return context.json(activityDescriptorListResponseSchema.parse({ descriptors, completed }));
  });

  const open = async (context: ActivityContext, activityId: string, lesson: ActivityLesson, descriptor: { sourceId: string; sourceLabel: string }, row: CacheRow, ephemeral: boolean) => {
    const payload = validPayload(row);
    if (!payload) return apiError(context, 503, "ACTIVITY_UNAVAILABLE", "This activity is not ready yet. Try again shortly.");
    const activity = sourcePayload(row, descriptor, payload);
    const run = ephemeral
      ? { id: crypto.randomUUID(), cursor: 0, reader: null, status: "active" as const, startedAt: Date.now(), updatedAt: Date.now(), completedAt: null, ephemeral: true }
      : presentRun(await ensureRun(context.env.DB, activityId, userId(context), Date.now(), () => metricsSnapshot(context.env.DB, userId(context), { id: lesson.courseId }, lesson)));
    return context.json(activityOpenResponseSchema.parse({ status: "ready", activity, run, ephemeral }));
  };

  app.post(`${PATH}/open`, deps.requireActivityAccess, async (context) => {
    const found = await getLesson(context); if ("error" in found) return found.error;
    const parsed = await parseJson(context, activityOpenRequestSchema, 2_048); if ("response" in parsed) return parsed.response;
    const { sourceId, type, expectedFingerprint } = parsed.data;
    const resolved = await currentSource(found, sourceId, type);
    const descriptor = verifyLessonActivitySource(resolved.descriptors, sourceId, type, expectedFingerprint);
    if (!descriptor) return apiError(context, 409, "SOURCE_CHANGED", "This lesson section changed. Refresh its activities.");
    const key = await cacheKey(found, sourceId, type, expectedFingerprint);
    const db = context.env.DB;
    let row = await db.prepare(`SELECT ${cacheColumns} FROM lesson_activities WHERE cache_key=?`).bind(key).first<CacheRow>();
    if (row?.status === "ready" && validPayload(row)) return open(context, row.id, found, descriptor, row, found.archived);
    if (type === "read_aloud" || type === "review_words") {
      // No model, no lease and no AI allowance: the payload is written straight from the published source and the row is ready.
      let materialized: LessonActivityPayload;
      try { materialized = await materializeActivity(type, { sourceId, blocks: activitySourceBlocks(found.document, sourceId, true) }); } catch { return apiError(context, 503, "ACTIVITY_GENERATION_FAILED", "This activity could not be prepared. Try again shortly."); }
      const now = Date.now();
      await db.prepare(`INSERT INTO lesson_activities (id,lesson_id,course_id,source_id,activity_type,source_fingerprint,recipe_version,schema_version,language,cache_key,status,payload,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,'ready',?,?,?) ON CONFLICT(cache_key) DO UPDATE SET status='ready',payload=excluded.payload,lease_token=NULL,lease_expires_at=NULL,next_attempt_at=NULL,updated_at=excluded.updated_at WHERE lesson_activities.status!='ready'`)
        .bind(crypto.randomUUID(), found.lessonId, found.courseId, sourceId, type, expectedFingerprint, 1, 1, found.language, key, JSON.stringify(materialized), now, now).run();
      row = await db.prepare(`SELECT ${cacheColumns} FROM lesson_activities WHERE cache_key=?`).bind(key).first<CacheRow>();
      return open(context, row!.id, found, descriptor, row!, found.archived);
    }
    if (found.archived) return apiError(context, 409, "ACTIVITY_READ_ONLY", "This activity has no cached content and cannot be generated from an archived course.");
    const uid = userId(context); const now = Date.now(); const token = crypto.randomUUID();
    if (!row) {
      const id = crypto.randomUUID();
      await db.prepare(`INSERT INTO lesson_activities (id,lesson_id,course_id,source_id,activity_type,source_fingerprint,recipe_version,schema_version,language,cache_key,status,lease_token,lease_expires_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,'generating',?,?,?,?) ON CONFLICT(cache_key) DO NOTHING`)
        .bind(id, found.lessonId, found.courseId, sourceId, type, expectedFingerprint, 1, 1, found.language, key, token, now + LESSON_ACTIVITY_LEASE_MS, now, now).run();
      row = await db.prepare(`SELECT ${cacheColumns} FROM lesson_activities WHERE cache_key=?`).bind(key).first<CacheRow>();
      if (row?.leaseToken !== token) return context.json(activityOpenResponseSchema.parse({ status: "generating", activityId: row!.id, retryAfterMs: RETRY_MS }), 202);
    } else if (!await claimGeneration(db, { row, leaseToken: token, now })) {
      return context.json(activityOpenResponseSchema.parse({ status: "generating", activityId: row.id, retryAfterMs: RETRY_MS }), 202);
    }
    const settings = await readAiSettings(db);
    const reserved = await reserveCacheMiss(db, { userId: uid, cacheKey: key, cap: settings.dailyTurnCap, now });
    if (!reserved) {
      await db.prepare("UPDATE lesson_activities SET status='failed',lease_token=NULL,lease_expires_at=NULL,next_attempt_at=?,updated_at=? WHERE id=? AND lease_token=?")
        .bind(now + LESSON_ACTIVITY_RETRY_MS, now, row!.id, token).run();
      await releaseCacheMiss(db, uid, key, now);
      return apiError(context, 429, "AI_DAILY_LIMIT", "You have reached today's activity generation limit.");
    }
    // Start generation in the request that claimed the lease. Other opens poll this same cache row.
    try {
      const source = activitySourceData(found.document, sourceId);
      const trace: GenerationTrace = { model: null };
      const payload = await generateLessonActivity({ trace, env: context.env, db, userId: uid, type, language: found.language, source: source.content, lessonGoal: found.goal, blocks: activitySourceBlocks(found.document, sourceId), eligibleFollowUps: resolved.descriptors.flatMap((item) => item.activityTypes) });
      // Close the race between the first fingerprint check and the atomic published_at guard.
      const latest = await getLesson(context);
      if ("error" in latest) throw new Error("SOURCE_CHANGED");
      const stillCurrent = await currentSource(latest, sourceId, type);
      const current = stillCurrent.descriptors.find((item) => item.sourceId === sourceId && item.activityTypes.includes(type));
      if (latest.publishedAt !== found.publishedAt || current?.fingerprint !== expectedFingerprint) throw new Error("SOURCE_CHANGED");
      const committed = await commitGeneratedPayload(db, { activityId: row!.id, leaseToken: token, payload: JSON.stringify(payload), publishedAt: found.publishedAt, generatedBy: trace.model });
      await releaseCacheMiss(db, uid, key, now);
      if (!committed) return apiError(context, 409, "SOURCE_CHANGED", "The source changed while this activity was being prepared.");
      row = await readActivity(db, row!.id);
      return open(context, row!.id, found, descriptor, row!, false);
    } catch (error) {
      await releaseCacheMiss(db, uid, key, now);
      const code = error instanceof Error ? error.message : "";
      const freshNow = Date.now();
      await db.prepare(`UPDATE lesson_activities SET status='failed',lease_token=NULL,lease_expires_at=NULL,next_attempt_at=?,updated_at=?
        WHERE id=? AND status='generating' AND lease_token=?`).bind(freshNow + LESSON_ACTIVITY_RETRY_MS, freshNow, row!.id, token).run();
      if (code === "SOURCE_CHANGED") return apiError(context, 409, "SOURCE_CHANGED", "The source changed while this activity was being prepared.");
      return apiError(context, 503, "ACTIVITY_GENERATION_FAILED", "This activity could not be prepared. Try again shortly.");
    }
  });

  app.get(`${PATH}/:activityId`, deps.requireActivityAccess, async (context) => {
    const found = await getLesson(context); if ("error" in found) return found.error;
    const row = await readActivity(context.env.DB, context.req.param("activityId") ?? "");
    if (!row || row.lessonId !== found.lessonId || row.courseId !== found.courseId) return apiError(context, 404, "ACTIVITY_NOT_FOUND", "This activity is not available.");
    if (row.status !== "ready") {
      // A failed row past its backoff reports zero: the client may open the activity again to claim a retry.
      if (row.status === "failed") return context.json(activityStatusResponseSchema.parse({ status: "failed", retryAfterMs: row.nextAttemptAt === null ? null : Math.max(0, row.nextAttemptAt - Date.now()) }));
      return context.json(activityStatusResponseSchema.parse({ status: "generating", retryAfterMs: RETRY_MS }), 202);
    }
    const payload = validPayload(row); if (!payload) return apiError(context, 503, "ACTIVITY_UNAVAILABLE", "This activity is unavailable.");
    const resolved = await currentSource(found, row.sourceId, activityType(row.activityType));
    const descriptor = resolved.descriptors.find((item) => item.sourceId === row.sourceId && item.activityTypes.includes(activityType(row.activityType)));
    const uid = userId(context);
    const run = await context.env.DB.prepare(`SELECT ${runColumns} FROM lesson_activity_runs WHERE activity_id=? AND user_id=?`).bind(row.id, uid).first<RunRow>();
    if ((!descriptor || descriptor.fingerprint !== row.sourceFingerprint) && !run) return apiError(context, 404, "ACTIVITY_NOT_FOUND", "This activity is no longer available.");
    if (!run && !found.archived) return apiError(context, 404, "ACTIVITY_NOT_FOUND", "Open this activity from its lesson first.");
    if (!descriptor) return apiError(context, 404, "ACTIVITY_NOT_FOUND", "This activity is no longer available.");
    return context.json(activityStatusResponseSchema.parse({ status: "ready", activity: sourcePayload(row, descriptor, payload), run: run ? presentRun(run) : {
      id: crypto.randomUUID(), cursor: 0, reader: null, status: "active", startedAt: Date.now(), updatedAt: Date.now(), completedAt: null, ephemeral: true,
    }, ephemeral: found.archived }));
  });

  app.post(`${PATH}/:activityId/answers`, deps.requireActivityAccess, async (context) => {
    const found = await getLesson(context); if ("error" in found) return found.error;
    const parsed = await parseJson(context, activityAnswerRequestSchema, 4_096); if ("response" in parsed) return parsed.response;
    const row = await readActivity(context.env.DB, context.req.param("activityId") ?? "");
    if (!row || row.lessonId !== found.lessonId || row.status !== "ready") return apiError(context, 404, "ACTIVITY_NOT_FOUND", "This activity is not available.");
    const payload = validPayload(row); if (!payload) return apiError(context, 404, "ACTIVITY_NOT_FOUND", "This activity is not available.");
    const uid = userId(context); const db = context.env.DB;
    const run = await db.prepare(`SELECT ${runColumns} FROM lesson_activity_runs WHERE id=? AND activity_id=? AND user_id=?`).bind(parsed.data.runId, row.id, uid).first<RunRow>();
    if (!run && !found.archived) return apiError(context, 404, "ACTIVITY_RUN_NOT_FOUND", "This activity run is not available.");
    const prior = run ? await db.prepare(`SELECT id AS answerId,item_id AS itemId,correct,reference FROM lesson_activity_answers WHERE run_id=? AND idempotency_key=?`).bind(run.id, parsed.data.idempotencyKey).first<{ answerId: string; itemId: string; correct: number; reference: string | null }>() : null;
    if (prior) return context.json(activityAnswerResponseSchema.parse({ answerId: prior.answerId, itemId: prior.itemId, correct: Boolean(prior.correct), reference: prior.reference, explanation: null, pronunciation: null }));
    if (!run && !found.archived) return apiError(context, 404, "ACTIVITY_RUN_NOT_FOUND", "This activity run is not available.");
    const grade = gradeLessonActivityAnswer(payload, parsed.data.itemId, parsed.data.answer);
    if (!grade) return apiError(context, 400, "ACTIVITY_ITEM_INVALID", "This answer does not match an activity item.");
    // One ID for the stored row and the response, so a retry with the same idempotency key returns what the first call returned.
    const answerId = crypto.randomUUID();
    if (!found.archived && run) {
      const answerText = JSON.stringify(parsed.data.answer);
      const firstOfItem = payload.type === "guided_grammar" && !(await db.prepare("SELECT COUNT(*) AS total FROM lesson_activity_answers WHERE run_id=? AND item_id=?").bind(run.id, parsed.data.itemId).first<{ total: number }>())?.total;
      try {
        await db.prepare(`INSERT INTO lesson_activity_answers (id,run_id,item_id,idempotency_key,answer,input_mode,correct,matched,reference,pronunciation_json,created_at)
          VALUES (?,?,?,?,?,?,?,?,?,NULL,?)`).bind(answerId, run.id, parsed.data.itemId, parsed.data.idempotencyKey, answerText, parsed.data.inputMode, grade.correct ? 1 : 0, grade.correct ? 1 : 0, grade.reference, Date.now()).run();
      } catch {
        const duplicate = await db.prepare(`SELECT id AS answerId,item_id AS itemId,correct,reference FROM lesson_activity_answers WHERE run_id=? AND idempotency_key=?`).bind(run.id, parsed.data.idempotencyKey).first<{ answerId: string; itemId: string; correct: number; reference: string | null }>();
        if (!duplicate) throw new Error("ACTIVITY_ANSWER_WRITE_FAILED");
        return context.json(activityAnswerResponseSchema.parse({ answerId: duplicate.answerId, itemId: duplicate.itemId, correct: Boolean(duplicate.correct), reference: duplicate.reference, explanation: null, pronunciation: null }));
      }
      if (firstOfItem) await creditGuidedReading(db, uid, found, payload, parsed.data.itemId);
    }
    return context.json(activityAnswerResponseSchema.parse({ answerId, itemId: parsed.data.itemId, correct: grade.correct, reference: grade.reference, explanation: grade.explanation, pronunciation: null }));
  });

  app.patch(`${PATH}/:activityId/run`, deps.requireActivityAccess, async (context) => {
    const found = await getLesson(context); if ("error" in found) return found.error;
    const parsed = await parseJson(context, activityRunPatchRequestSchema, 2_048); if ("response" in parsed) return parsed.response;
    const row = await readActivity(context.env.DB, context.req.param("activityId") ?? "");
    if (!row || row.lessonId !== found.lessonId || row.status !== "ready") return apiError(context, 404, "ACTIVITY_NOT_FOUND", "This activity is not available.");
    const uid = userId(context); const db = context.env.DB;
    const run = await db.prepare(`SELECT ${runColumns} FROM lesson_activity_runs WHERE activity_id=? AND user_id=?`).bind(row.id, uid).first<RunRow>();
    if (!run) return apiError(context, 404, "ACTIVITY_RUN_NOT_FOUND", "This activity run is not available.");
    const payload = validPayload(row); if (!payload) return apiError(context, 503, "ACTIVITY_UNAVAILABLE", "This activity is unavailable.");
    const now = Date.now(); let changes = 0;
    if (parsed.data.action === "set_reader") {
      // Choosing whose lines to read starts the reading over; earlier answers stay with the run, and completion counts the new lines.
      if (payload.type !== "read_aloud") return apiError(context, 400, "ACTIVITY_ACTION_INVALID", "A reader is chosen only in read aloud.");
      const reader = parsed.data.reader;
      if (reader !== null && !dialogueSpeakers(payload.lines).includes(reader)) return apiError(context, 400, "ACTIVITY_READER_INVALID", "This speaker has no lines in this dialogue.");
      changes = (await db.prepare("UPDATE lesson_activity_runs SET reader=?,cursor=0,status='active',completed_at=NULL,updated_at=? WHERE id=? AND user_id=?").bind(reader, now, run.id, uid).run()).meta.changes ?? 0;
    } else if (parsed.data.action === "restart") {
      changes = (await db.prepare("UPDATE lesson_activity_runs SET cursor=0,status='active',completed_at=NULL,updated_at=? WHERE id=? AND user_id=?").bind(now, run.id, uid).run()).meta.changes ?? 0;
      // The snapshot is the state once this run no longer counts as completed.
      if (changes) await db.prepare("UPDATE lesson_activity_runs SET metrics_before=? WHERE id=? AND user_id=?").bind(await metricsSnapshot(db, uid, { id: found.courseId }, found), run.id, uid).run();
    } else if (parsed.data.action === "continue") {
      if (parsed.data.expectedCursor !== run.cursor) return apiError(context, 409, "ACTIVITY_CURSOR_STALE", "This activity moved ahead. Refresh to continue.");
      const itemId = activityItemIds(payload, run.reader)[run.cursor];
      if (itemId === undefined) return apiError(context, 400, "ACTIVITY_ACTION_INVALID", "There is no next item to continue to.");
      const count = await db.prepare("SELECT COUNT(*) AS total FROM lesson_activity_answers WHERE run_id=? AND item_id=?").bind(run.id, itemId).first<{ total: number }>();
      if (!count?.total) return apiError(context, 409, "ACTIVITY_ANSWER_REQUIRED", "Answer this item before continuing.");
      changes = (await db.prepare("UPDATE lesson_activity_runs SET cursor=cursor+1,updated_at=? WHERE id=? AND user_id=? AND cursor=?").bind(now, run.id, uid, run.cursor).run()).meta.changes ?? 0;
    } else {
      const required = activityItemIds(payload, run.reader);
      const saved = await db.prepare("SELECT COUNT(DISTINCT item_id) AS total FROM lesson_activity_answers WHERE run_id=? AND item_id IN (SELECT value FROM json_each(?))").bind(run.id, JSON.stringify(required)).first<{ total: number }>();
      if ((saved?.total ?? 0) < required.length) return apiError(context, 409, "ACTIVITY_INCOMPLETE", "Finish every item before completing this activity.");
      changes = (await db.prepare("UPDATE lesson_activity_runs SET status='completed',completed_at=?,updated_at=? WHERE id=? AND user_id=?").bind(now, now, run.id, uid).run()).meta.changes ?? 0;
    }
    if (!changes) return apiError(context, 409, "ACTIVITY_RUN_STALE", "This activity run changed. Refresh and try again.");
    const updated = await db.prepare(`SELECT ${runColumns} FROM lesson_activity_runs WHERE id=? AND user_id=?`).bind(run.id, uid).first<RunRow>();
    if (parsed.data.action !== "complete") return context.json(activityRunPatchResponseSchema.parse({ run: presentRun(updated!) }));
    // Completion reports the payload's requested metrics: the snapshot taken when the run started or restarted, and the values now.
    // A key the snapshot lacks (a run from before snapshots) is left out.
    const before = parseMetricsSnapshot((await db.prepare("SELECT metrics_before AS snapshot FROM lesson_activity_runs WHERE id=? AND user_id=?").bind(run.id, uid).first<{ snapshot: string | null }>())?.snapshot ?? null);
    const after = await readActivityMetrics(db, uid, { id: found.courseId }, found);
    const metrics = payload.metrics.flatMap((key) => before[key] === undefined ? [] : [{ key, before: before[key], after: after[key] }]);
    return context.json(activityRunPatchResponseSchema.parse({ run: presentRun(updated!), metrics }));
  });

  // Read-aloud speech (docs/speech.md#lesson-activity-read-aloud): one stored line of the activity, in its speaker's course cast voice.
  // The request names a line and, for a long line, a part; the text and the voice come from the stored activity, so no request text
  // or voice is ever synthesized. Lines the app voices and the learner's own reference line are both speakable this way.
  app.post(`${PATH}/:activityId/speech`, deps.requireActivityAccess, async (context) => {
    const found = await getLesson(context); if ("error" in found) return found.error;
    const parsed = await parseJson(context, activitySpeechRequestSchema, 1_024); if ("response" in parsed) return parsed.response;
    const db = context.env.DB;
    const row = await readActivity(db, context.req.param("activityId") ?? "");
    if (!row || row.lessonId !== found.lessonId || row.courseId !== found.courseId || row.status !== "ready") return apiError(context, 404, "ACTIVITY_NOT_FOUND", "This activity is not available.");
    if (row.activityType !== "read_aloud") return apiError(context, 400, "ACTIVITY_ACTION_INVALID", "Audio is available only for read aloud.");
    const payload = validPayload(row);
    if (!payload || payload.type !== "read_aloud") return apiError(context, 503, "ACTIVITY_UNAVAILABLE", "This activity is unavailable.");
    const uid = userId(context);
    const run = await db.prepare(`SELECT ${runColumns} FROM lesson_activity_runs WHERE id=? AND activity_id=? AND user_id=?`).bind(parsed.data.runId, row.id, uid).first<RunRow>();
    // An archived lesson has no owned run to check. As on the answer route, it serves ready audio and writes no learner state.
    if (!run && !found.archived) return apiError(context, 404, "ACTIVITY_RUN_NOT_FOUND", "This activity run is not available.");
    const turn = payload.lines.find((candidate) => candidate.id === parsed.data.lineId);
    if (!turn) return apiError(context, 404, "ACTIVITY_LINE_NOT_FOUND", "This line is not part of this activity.");
    const chunks = speechChunks(turn.referenceText.trim());
    // A long line is never spoken whole or truncated: the learner asks for each part, and a part is required when there are several.
    if (parsed.data.chunkIndex === undefined && chunks.length > 1) return apiError(context, 400, "ACTIVITY_CHUNK_INVALID", "Ask for this long line one part at a time.");
    const chunkIndex = parsed.data.chunkIndex ?? 0;
    const chunk = chunks[chunkIndex];
    if (chunk === undefined) return apiError(context, 400, "ACTIVITY_CHUNK_INVALID", "This line has no part with that number.");
    const { AZURE_SPEECH_KEY: key, AZURE_SPEECH_REGION: region } = context.env;
    if (!key || !region) return apiError(context, 503, "SPEECH_UNAVAILABLE", "Audio is not available.");
    // The voice resolves by speaker name exactly as the lesson's own dialogue audio does: the cast entry, else the position among
    // the published lesson's dialogue speakers (then the stored lines' speakers, for a speaker no longer published).
    const course = await db.prepare("SELECT speech_cast AS speechCast FROM courses WHERE id = ?").bind(found.courseId).first<{ speechCast: string | null }>();
    const lessonSpeakers = [...walkLessonBlocks(found.document.blocks)].flatMap(({ block }) => block.type === "dialogue" ? readDialogueTurns(block as LessonBlockOf<"dialogue">).map((candidate) => candidate.speaker) : []);
    const voiceOf = dialogueVoices([...lessonSpeakers, ...payload.lines.map((line) => line.speaker)], storedSpeechCast(course?.speechCast ?? null), found.language);
    const spoken = { key: `line:${turn.id}:${chunkIndex}`, voice: voiceOf(turn.speaker), text: chunk, ipa: null };
    const item = { ...spoken, hash: await speechClipHash(spoken) };
    // The daily character cap is checked before the clip is looked up, as the tutor's on-demand audio does.
    const settings = await readAiSettings(db);
    try {
      await assertDailySpeechCap(db, uid, settings, chunk.length);
    } catch (error) {
      const response = aiErrorResponse(context, error); if (response) return response;
      throw error;
    }
    if (found.archived && (await readClips(db, [item.hash])).get(item.hash)?.status !== "ready") {
      return apiError(context, 409, "ACTIVITY_READ_ONLY", "This audio has not been made and cannot be made for an archived course.");
    }
    // The clip is the lesson's clip for this text and voice: a ready one is served from R2, otherwise it is synthesized here.
    const clip = await onDemandClip(context.env, item, azureSynthesizer(key, region));
    if (clip === "pending") return context.json(activitySpeechResponseSchema.parse({ status: "pending", retryAfterMs: RETRY_MS }), 202);
    if (clip === "failed") return apiError(context, 503, "SPEECH_FAILED", "The audio could not be made. Try again later.");
    await recordSpeechUsage(db, { userId: uid, surface: "lesson_activity", clipHash: item.hash, characters: chunk.length, cached: clip === "cached" });
    const base = context.env.PUBLIC_MEDIA_BASE_URL.replace(/\/$/, "");
    return context.json(activitySpeechResponseSchema.parse({
      status: "ready", url: clipUrl((clipKey) => `${base}/${clipKey.split("/").map(encodeURIComponent).join("/")}`, item.hash),
    }));
  });
}

