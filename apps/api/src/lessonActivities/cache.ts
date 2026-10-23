import { utcDayStart } from "../ai/usage";

export const LESSON_ACTIVITY_LEASE_MS = 120_000;
export const LESSON_ACTIVITY_RESERVATION_MS = 180_000;
export const LESSON_ACTIVITY_RETRY_MS = 30_000;

export type CacheRow = {
  id: string; lessonId: string; courseId: string; sourceId: string; activityType: string; sourceFingerprint: string;
  recipeVersion: number; schemaVersion: number; language: string; cacheKey: string; status: "generating" | "ready" | "failed";
  leaseToken: string | null; leaseExpiresAt: number | null; nextAttemptAt: number | null; payload: string | null; generatedBy: string | null;
};

/** Atomically elect one generator. A live lease is never stolen; expiry permits recovery. */
export async function claimGeneration(db: D1Database, input: {
  row: CacheRow; leaseToken: string; now?: number; leaseMs?: number;
}): Promise<boolean> {
  const now = input.now ?? Date.now();
  const result = await db.prepare(
    `UPDATE lesson_activities SET status='generating', lease_token=?, lease_expires_at=?, next_attempt_at=NULL, updated_at=?
     WHERE id=? AND status!='ready' AND (status='failed' AND (next_attempt_at IS NULL OR next_attempt_at<=?)
       OR status='generating' AND lease_expires_at<=?)`,
  ).bind(input.leaseToken, now + (input.leaseMs ?? LESSON_ACTIVITY_LEASE_MS), now, input.row.id, now, now).run();
  return (result.meta.changes ?? 0) === 1;
}

/** Reserves one daily AI turn in the same conditional statement used to count active reservations. */
export async function reserveCacheMiss(db: D1Database, input: {
  userId: string; cacheKey: string; cap: number; now?: number; expiresInMs?: number;
}): Promise<boolean> {
  const now = input.now ?? Date.now();
  const day = utcDayStart(now);
  const result = await db.prepare(
    `INSERT INTO ai_turn_reservations (id,user_id,cache_key,day_start,expires_at)
     SELECT ?,?,?,?,? WHERE
       (SELECT COUNT(*) FROM ai_usage WHERE user_id=? AND created_at>=? AND created_at<? AND turn_start=1)
       + (SELECT COUNT(*) FROM ai_turn_reservations WHERE user_id=? AND day_start=? AND expires_at>?) < ?
     ON CONFLICT(user_id,cache_key,day_start) DO UPDATE SET expires_at=excluded.expires_at
       WHERE ai_turn_reservations.expires_at<=?`,
  ).bind(crypto.randomUUID(), input.userId, input.cacheKey, day, now + (input.expiresInMs ?? LESSON_ACTIVITY_RESERVATION_MS),
    input.userId, day, day + 86_400_000, input.userId, day, now, input.cap, now).run();
  return (result.meta.changes ?? 0) === 1;
}

export async function releaseCacheMiss(db: D1Database, userId: string, cacheKey: string, now = Date.now()) {
  await db.prepare("DELETE FROM ai_turn_reservations WHERE user_id=? AND cache_key=? AND day_start=?")
    .bind(userId, cacheKey, utcDayStart(now)).run();
}

/** Commit only if this worker still owns the current, unexpired lease and the source has not been republished. */
export async function commitGeneratedPayload(db: D1Database, input: {
  activityId: string; leaseToken: string; payload: string; publishedAt: number; generatedBy?: string | null; now?: number;
}): Promise<boolean> {
  const now = input.now ?? Date.now();
  const result = await db.prepare(
    `UPDATE lesson_activities SET status='ready', payload=?, generated_by=?, lease_token=NULL, lease_expires_at=NULL, next_attempt_at=NULL, updated_at=?
     WHERE id=? AND status='generating' AND lease_token=? AND lease_expires_at>? AND EXISTS (
     SELECT 1 FROM course_lessons l WHERE l.id=lesson_activities.lesson_id AND l.published_doc IS NOT NULL AND l.published_at=?
     )`,
  ).bind(input.payload, input.generatedBy ?? null, now, input.activityId, input.leaseToken, now, input.publishedAt).run();
  return (result.meta.changes ?? 0) === 1;
}

