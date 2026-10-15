import { DEFAULT_TUTOR_PROFILE, TUTOR_NOTES_MAX, tutorNativeLanguageSchema, tutorReplyLanguageSchema, type TutorProfile } from "@wordinator/contracts/tutor";

// The tutor profile (docs/ai-tutor.md#tutor-profile): one `learner_profiles` row per account; a missing row reads as the defaults.

type ProfileRow = { nativeLanguage: string; replyLanguage: string; goals: string | null; notes: string | null; updatedAt: number };

export async function readTutorProfile(db: D1Database, userId: string): Promise<TutorProfile> {
  const row = await db.prepare(
    "SELECT native_language AS nativeLanguage, reply_language AS replyLanguage, goals, tutor_notes AS notes, updated_at AS updatedAt FROM learner_profiles WHERE user_id = ?",
  ).bind(userId).first<ProfileRow>();
  if (!row) return DEFAULT_TUTOR_PROFILE;
  return {
    nativeLanguage: tutorNativeLanguageSchema.catch(DEFAULT_TUTOR_PROFILE.nativeLanguage).parse(row.nativeLanguage),
    replyLanguage: tutorReplyLanguageSchema.catch(DEFAULT_TUTOR_PROFILE.replyLanguage).parse(row.replyLanguage),
    goals: row.goals, notes: row.notes, updatedAt: row.updatedAt,
  };
}

// The learner's fields; tutor notes are kept.
export async function updateTutorProfile(db: D1Database, userId: string, input: { nativeLanguage: TutorProfile["nativeLanguage"]; replyLanguage: TutorProfile["replyLanguage"]; goals: string | null }, now = Date.now()) {
  await db.prepare(
    `INSERT INTO learner_profiles (user_id, native_language, reply_language, goals, tutor_notes, updated_at) VALUES (?, ?, ?, ?, NULL, ?)
     ON CONFLICT (user_id) DO UPDATE SET native_language = excluded.native_language, reply_language = excluded.reply_language, goals = excluded.goals, updated_at = excluded.updated_at`,
  ).bind(userId, input.nativeLanguage, input.replyLanguage, input.goals, now).run();
  return readTutorProfile(db, userId);
}

// The tutor's own notes (`update_tutor_notes`), replacing the previous notes; empty notes clear them. The learner clears them with
// `DELETE /api/ai/profile/notes`.
export async function writeTutorNotes(db: D1Database, userId: string, notes: string | null, now = Date.now()) {
  const value = notes?.trim().slice(0, TUTOR_NOTES_MAX) || null;
  await db.prepare(
    `INSERT INTO learner_profiles (user_id, native_language, reply_language, goals, tutor_notes, updated_at) VALUES (?, ?, ?, NULL, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET tutor_notes = excluded.tutor_notes, updated_at = excluded.updated_at`,
  ).bind(userId, DEFAULT_TUTOR_PROFILE.nativeLanguage, DEFAULT_TUTOR_PROFILE.replyLanguage, value, now).run();
  return readTutorProfile(db, userId);
}
