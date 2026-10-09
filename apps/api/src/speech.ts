import { SPEECH_VOICES, speechCastSchema, type SpeechCast } from "@wordinator/contracts";
import { parseStoredLessonDocument, type DraftSpeech, type LessonDocument, type SpeechMap, type SpeechStatus } from "@wordinator/contracts/lesson-document";
import { speechClipHash, speechClipKey, speechItems, speechSsml, voiceSampleItems, type SpeechItem, type SpeechLanguage } from "@wordinator/contracts/speech";
import { logError, logInfo } from "./logger";

// Lesson speech (docs/speech.md): background synthesis through Azure AI Speech, clips stored in R2 by content hash.

type SpeechEnv = Pick<Env, "DB" | "MEDIA" | "AZURE_SPEECH_KEY" | "AZURE_SPEECH_REGION">;

export const SPEECH_DRAFT_DELAY_MS = 2 * 60 * 1000;
export const SPEECH_CLAIM_LEASE_MS = 10 * 60 * 1000;
export const SPEECH_MAX_ATTEMPTS = 5;
const SPEECH_RETRY_BASE_MS = 60 * 1000;
const SPEECH_JOBS_PER_RUN = 10;
const SPEECH_CLIPS_PER_RUN = 40;
const SPEECH_TIMEOUT_MS = 15_000;
const SPEECH_THROTTLE_MS = 60 * 1000;

// ---- Azure client ----

// `throttled` (429) and `unauthorized` (401/403) stop the whole run without counting an attempt; anything else counts.
export type SynthesisResult = { ok: true; audio: ArrayBuffer } | { ok: false; kind: "throttled" | "unauthorized" | "failed"; status: number | null; retryAfterMs: number | null };
export type Synthesize = (ssml: string) => Promise<SynthesisResult>;

// Calls the REST endpoint. Never logs the text or the key; callers log the status only.
export function azureSynthesizer(key: string, region: string, fetcher: typeof fetch = fetch): Synthesize {
  return async (ssml) => {
    let response: Response;
    try {
      response = await fetcher(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml",
          "X-Microsoft-OutputFormat": "audio-24khz-96kbitrate-mono-mp3", "User-Agent": "wordinator",
        },
        body: ssml, signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, kind: "failed", status: null, retryAfterMs: null };
    }
    if (response.ok) return { ok: true, audio: await response.arrayBuffer() };
    await response.body?.cancel();
    const retryAfter = Number(response.headers.get("retry-after"));
    const retryAfterMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : null;
    if (response.status === 429) return { ok: false, kind: "throttled", status: 429, retryAfterMs };
    if (response.status === 401 || response.status === 403) return { ok: false, kind: "unauthorized", status: response.status, retryAfterMs: null };
    return { ok: false, kind: "failed", status: response.status, retryAfterMs: null };
  };
}

// ---- Items, hashes, and clip lookups ----

export type HashedSpeechItem = SpeechItem & { hash: string };
export const hashSpeechItems = (items: SpeechItem[]) => Promise.all(items.map(async (item) => ({ ...item, hash: await speechClipHash(item) })));

export function storedSpeechCast(raw: string | null): SpeechCast | null {
  if (!raw) return null;
  try {
    return speechCastSchema.safeParse(JSON.parse(raw)).data ?? null;
  } catch {
    return null;
  }
}

export const documentSpeechItems = (document: LessonDocument, cast: SpeechCast | null, language: SpeechLanguage) => hashSpeechItems(speechItems(document, cast, language));

type ClipRow = { hash: string; status: SpeechStatus; attempts: number; nextAttemptAt: number | null; claimedAt: number | null };

// One indexed lookup by hash per call, with the hashes as one JSON parameter.
export async function readClips(db: D1Database, hashes: readonly string[]) {
  const unique = [...new Set(hashes)];
  if (!unique.length) return new Map<string, ClipRow>();
  const rows = await db.prepare(
    "SELECT hash, status, attempts, next_attempt_at AS nextAttemptAt, claimed_at AS claimedAt FROM speech_clips WHERE hash IN (SELECT value FROM json_each(?))",
  ).bind(JSON.stringify(unique)).all<ClipRow>();
  return new Map(rows.results.map((row) => [row.hash, row]));
}

export const clipUrl = (mediaUrl: (key: string) => string, hash: string) => mediaUrl(speechClipKey(hash));

// Ready clips only, keyed by item key.
export function presentSpeech(items: HashedSpeechItem[], clips: Map<string, ClipRow>, mediaUrl: (key: string) => string): SpeechMap {
  return Object.fromEntries(items.filter((item) => clips.get(item.hash)?.status === "ready").map((item) => [item.key, clipUrl(mediaUrl, item.hash)]));
}

// Every item with its status; an item whose clip row does not exist yet is pending.
export function presentDraftSpeech(items: HashedSpeechItem[], clips: Map<string, ClipRow>, mediaUrl: (key: string) => string): DraftSpeech {
  return Object.fromEntries(items.map((item) => {
    const status = clips.get(item.hash)?.status ?? "pending";
    return [item.key, { status, url: status === "ready" ? clipUrl(mediaUrl, item.hash) : null }];
  }));
}

// ---- Jobs ----

// Upserts the lesson's job. Draft saves push it 2 minutes past the last save; publishing and cast changes make it due now.
export function speechJobStatement(db: D1Database, lesson: { groupId: string; courseId: string; lessonId: string }, dueAt: number, now = Date.now()) {
  return db.prepare(
    `INSERT INTO speech_jobs (lesson_id, group_id, course_id, due_at, attempts, created_at, updated_at)
     SELECT id, group_id, course_id, ?, 0, ?, ? FROM course_lessons WHERE group_id = ? AND course_id = ? AND id = ?
     ON CONFLICT (lesson_id) DO UPDATE SET due_at = excluded.due_at, attempts = 0, updated_at = excluded.updated_at`,
  ).bind(dueAt, now, now, lesson.groupId, lesson.courseId, lesson.lessonId);
}

export function courseSpeechJobsStatement(db: D1Database, course: { groupId: string; courseId: string }, now = Date.now()) {
  return db.prepare(
    `INSERT INTO speech_jobs (lesson_id, group_id, course_id, due_at, attempts, created_at, updated_at)
     SELECT id, group_id, course_id, ?, 0, ?, ? FROM course_lessons WHERE group_id = ? AND course_id = ?
     ON CONFLICT (lesson_id) DO UPDATE SET due_at = excluded.due_at, attempts = 0, updated_at = excluded.updated_at`,
  ).bind(now, now, now, course.groupId, course.courseId);
}

// ---- Worker ----

type JobRow = {
  lessonId: string; groupId: string; courseId: string; updatedAt: number; draftDoc: string; publishedDoc: string | null;
  speechCast: string | null; language: SpeechLanguage;
};
export type SpeechRunOptions = { synthesize?: Synthesize; now?: () => number; lessonId?: string; clipLimit?: number };
export type SpeechRunResult = { synthesized: number; failed: number; finishedJobs: number; stopped: "throttled" | "unauthorized" | null };

// Takes due jobs, claims every clip of their documents that is not ready (by inserting its row, or by retaking an expired or
// retry-due claim), synthesizes the claims up to the run's cap, writes them to R2, and deletes a job once every item is ready
// or failed. A job that a newer save changed while it ran is left due.
export async function runSpeechJobs(env: SpeechEnv, options: SpeechRunOptions = {}): Promise<SpeechRunResult | null> {
  const synthesize = options.synthesize ?? (env.AZURE_SPEECH_KEY && env.AZURE_SPEECH_REGION ? azureSynthesizer(env.AZURE_SPEECH_KEY, env.AZURE_SPEECH_REGION) : null);
  if (!synthesize) {
    logInfo("speech.unconfigured");
    return null;
  }
  const now = options.now ?? Date.now;
  const db = env.DB;
  const result: SpeechRunResult = { synthesized: 0, failed: 0, finishedJobs: 0, stopped: null };
  let budget = options.clipLimit ?? SPEECH_CLIPS_PER_RUN;
  const jobs = await db.prepare(
    `SELECT j.lesson_id AS lessonId, j.group_id AS groupId, j.course_id AS courseId, j.updated_at AS updatedAt,
       l.draft_doc AS draftDoc, l.published_doc AS publishedDoc, c.speech_cast AS speechCast, g.language
     FROM speech_jobs j
     JOIN course_lessons l ON l.id = j.lesson_id AND l.group_id = j.group_id AND l.course_id = j.course_id
     JOIN courses c ON c.id = j.course_id AND c.group_id = j.group_id
     JOIN groups g ON g.id = j.group_id AND g.deleted_at IS NULL
     WHERE j.due_at <= ?${options.lessonId ? " AND j.lesson_id = ?" : ""} ORDER BY j.due_at, j.lesson_id LIMIT ?`,
  ).bind(now(), ...(options.lessonId ? [options.lessonId] : []), SPEECH_JOBS_PER_RUN).all<JobRow>();

  for (const job of jobs.results) {
    const cast = storedSpeechCast(job.speechCast);
    const documents = [job.publishedDoc, job.draftDoc].flatMap((raw) => {
      const document = raw === null ? null : parseStoredLessonDocument(JSON.parse(raw));
      return document ? [document] : [];
    });
    const unique = new Map<string, HashedSpeechItem>();
    for (const document of documents) for (const item of await documentSpeechItems(document, cast, job.language)) unique.set(item.hash, item);
    const items = [...unique.values()];
    const known = await readClips(db, items.map((item) => item.hash));

    for (const item of items) {
      if (budget <= 0 || result.stopped) break;
      const clip = known.get(item.hash);
      if (clip && clip.status !== "pending") continue;
      if (!(await claimClip(db, item, clip, now()))) continue;
      budget -= 1;
      const outcome = await synthesizeClaimed(env, item, synthesize, now);
      if (outcome.kind === "ready") result.synthesized += 1;
      else if (outcome.kind === "failed") result.failed += 1;
      else if (outcome.kind === "throttled" || outcome.kind === "unauthorized") {
        await db.prepare("UPDATE speech_jobs SET due_at = MAX(due_at, ?) WHERE lesson_id = ? AND updated_at = ?")
          .bind(now() + (outcome.retryAfterMs ?? SPEECH_THROTTLE_MS), job.lessonId, job.updatedAt).run();
        result.stopped = outcome.kind;
      }
    }
    if (result.stopped) break;

    // The job is done once every item is ready or failed. Otherwise it stays due, or waits for its earliest retry or lease.
    const clips = await readClips(db, items.map((item) => item.hash));
    const open = items.map((item) => clips.get(item.hash)).filter((clip) => !clip || clip.status === "pending");
    if (!open.length) {
      const deleted = await db.prepare("DELETE FROM speech_jobs WHERE lesson_id = ? AND updated_at = ?").bind(job.lessonId, job.updatedAt).run();
      if (deleted.meta.changes) result.finishedJobs += 1;
      continue;
    }
    const at = now();
    const ready = open.some((clip) => !clip || ((clip.claimedAt === null || clip.claimedAt <= at - SPEECH_CLAIM_LEASE_MS) && (clip.nextAttemptAt ?? 0) <= at));
    const next = ready ? at : Math.min(...open.map((clip) => clip!.claimedAt !== null ? clip!.claimedAt + SPEECH_CLAIM_LEASE_MS : clip!.nextAttemptAt ?? at));
    await db.prepare("UPDATE speech_jobs SET due_at = ?, attempts = attempts + 1 WHERE lesson_id = ? AND updated_at = ?").bind(next, job.lessonId, job.updatedAt).run();
  }
  logInfo("speech.run", { jobs: jobs.results.length, ...result });
  return result;
}

// Voice samples for the cast editor (docs/speech.md#dialogue-cast). The cron runs this after the jobs unless they were stopped;
// once every sample is ready or failed it is a single lookup.
export async function runSpeechSamples(env: SpeechEnv, options: Pick<SpeechRunOptions, "synthesize" | "now"> = {}): Promise<SpeechRunResult | null> {
  const synthesize = options.synthesize ?? (env.AZURE_SPEECH_KEY && env.AZURE_SPEECH_REGION ? azureSynthesizer(env.AZURE_SPEECH_KEY, env.AZURE_SPEECH_REGION) : null);
  if (!synthesize) return null;
  const now = options.now ?? Date.now;
  const result: SpeechRunResult = { synthesized: 0, failed: 0, finishedJobs: 0, stopped: null };
  const items = await hashSpeechItems((Object.keys(SPEECH_VOICES) as SpeechLanguage[]).flatMap(voiceSampleItems));
  const known = await readClips(env.DB, items.map((item) => item.hash));
  for (const item of items) {
    const clip = known.get(item.hash);
    if (clip && clip.status !== "pending") continue;
    if (!(await claimClip(env.DB, item, clip, now()))) continue;
    const outcome = await synthesizeClaimed(env, item, synthesize, now);
    if (outcome.kind === "ready") result.synthesized += 1;
    else if (outcome.kind === "failed") result.failed += 1;
    else if (outcome.kind === "throttled" || outcome.kind === "unauthorized") { result.stopped = outcome.kind; break; }
  }
  if (result.synthesized || result.failed || result.stopped) logInfo("speech.samples", result);
  return result;
}

type ClipOutcome = { kind: "ready" | "retry" | "failed" } | { kind: "throttled" | "unauthorized"; retryAfterMs: number | null };

// Synthesizes a claimed clip and records the outcome: ready in R2, a counted failure with its retry delay (failed after the last
// attempt), or, for throttling and a refused key, a released claim without a counted attempt.
async function synthesizeClaimed(env: SpeechEnv, item: HashedSpeechItem, synthesize: Synthesize, now: () => number): Promise<ClipOutcome> {
  const db = env.DB;
  const outcome = await synthesize(speechSsml(item));
  if (outcome.ok) {
    await env.MEDIA.put(speechClipKey(item.hash), outcome.audio, { httpMetadata: { contentType: "audio/mpeg", cacheControl: "public, max-age=31536000, immutable" } });
    await db.prepare("UPDATE speech_clips SET status = 'ready', attempts = attempts + 1, claimed_at = NULL, next_attempt_at = NULL, updated_at = ? WHERE hash = ?")
      .bind(now(), item.hash).run();
    return { kind: "ready" };
  }
  if (outcome.kind === "failed") {
    const at = now();
    const updated = await db.prepare(
      `UPDATE speech_clips SET attempts = attempts + 1, claimed_at = NULL, updated_at = ?,
         status = CASE WHEN attempts + 1 >= ? THEN 'failed' ELSE 'pending' END,
         next_attempt_at = CASE WHEN attempts + 1 >= ? THEN NULL ELSE ? + ? * (1 << attempts) END
       WHERE hash = ? RETURNING status`,
    ).bind(at, SPEECH_MAX_ATTEMPTS, SPEECH_MAX_ATTEMPTS, at, SPEECH_RETRY_BASE_MS, item.hash).first<{ status: SpeechStatus }>();
    logError("speech.synthesis_failed", { status: outcome.status, voice: item.voice });
    return { kind: updated?.status === "failed" ? "failed" : "retry" };
  }
  await db.prepare("UPDATE speech_clips SET claimed_at = NULL, updated_at = ? WHERE hash = ?").bind(now(), item.hash).run();
  logError(`speech.${outcome.kind}`, { status: outcome.status });
  return { kind: outcome.kind, retryAfterMs: outcome.retryAfterMs };
}

// Claims a clip for this run: a missing row is claimed by inserting it, a pending row by retaking it once its lease expired
// and its retry is due. Only the run whose statement changed the row synthesizes it.
async function claimClip(db: D1Database, item: HashedSpeechItem, clip: ClipRow | undefined, at: number) {
  const claimed = clip
    ? await db.prepare(
      `UPDATE speech_clips SET claimed_at = ?, updated_at = ? WHERE hash = ? AND status = 'pending'
       AND (claimed_at IS NULL OR claimed_at <= ?) AND (next_attempt_at IS NULL OR next_attempt_at <= ?)`,
    ).bind(at, at, item.hash, at - SPEECH_CLAIM_LEASE_MS, at).run()
    : await db.prepare(
      `INSERT INTO speech_clips (hash, voice, characters, status, attempts, next_attempt_at, claimed_at, created_at, updated_at)
       VALUES (?, ?, ?, 'pending', 0, NULL, ?, ?, ?) ON CONFLICT (hash) DO NOTHING`,
    ).bind(item.hash, item.voice, item.text.length, at, at, at).run();
  return claimed.meta.changes > 0;
}
