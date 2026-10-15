-- Learning data (C14a, docs/data-model.md#learning-data): the word review log and the memory folded from it, practice and
-- pronunciation attempts, and the progress audit log. Every row belongs to one user and none has `group_id` (storage
-- compatibility rule). Lesson and word IDs are keys into the published index with deliberately no foreign key to
-- `course_lesson_words`, like bookmarks. Conversation IDs carry no foreign key: the tutor's tables arrive later (C14g).
CREATE TABLE `word_reviews` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `term_key` text NOT NULL,
  `course_id` text NOT NULL,
  `lesson_id` text NOT NULL,
  `word_id` text NOT NULL,
  `direction` text NOT NULL,
  `result` text NOT NULL,
  `source` text NOT NULL,
  `seed_box` integer,
  `conversation_id` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`lesson_id`) REFERENCES `course_lessons`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `word_reviews_direction_check` CHECK (`direction` in ('understand', 'produce')),
  CONSTRAINT `word_reviews_result_check` CHECK (`result` in ('got', 'again')),
  CONSTRAINT `word_reviews_source_check` CHECK (`source` in ('drill', 'ai_chat', 'ai_practice', 'seed')),
  CONSTRAINT `word_reviews_seed_box_check` CHECK ((`source` = 'seed') = (`seed_box` IS NOT NULL) AND (`seed_box` IS NULL OR `seed_box` BETWEEN 1 AND 5))
);
--> statement-breakpoint
CREATE INDEX `word_reviews_term_idx` ON `word_reviews` (`user_id`, `term_key`, `direction`, `created_at`);
--> statement-breakpoint
CREATE INDEX `word_reviews_user_lesson_idx` ON `word_reviews` (`user_id`, `lesson_id`);
--> statement-breakpoint
-- Lesson deletion finds every account's reviews of the lesson, and the lesson cascade needs it too.
CREATE INDEX `word_reviews_lesson_idx` ON `word_reviews` (`lesson_id`);
--> statement-breakpoint
CREATE TABLE `word_memory` (
  `user_id` text NOT NULL,
  `term_key` text NOT NULL,
  `direction` text NOT NULL,
  `course_id` text NOT NULL,
  `lesson_id` text NOT NULL,
  `word_id` text NOT NULL,
  `recent` text NOT NULL,
  `reps` integer NOT NULL,
  `lapses` integer NOT NULL,
  `last_lapse_at` integer,
  `stability` real NOT NULL,
  `difficulty` real NOT NULL,
  `last_reviewed_at` integer NOT NULL,
  `known_override` integer DEFAULT 0 NOT NULL,
  PRIMARY KEY (`user_id`, `term_key`, `direction`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`lesson_id`) REFERENCES `course_lessons`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `word_memory_direction_check` CHECK (`direction` in ('understand', 'produce')),
  CONSTRAINT `word_memory_recent_check` CHECK (length(`recent`) <= 10 AND `recent` NOT GLOB '*[^ga]*'),
  CONSTRAINT `word_memory_difficulty_check` CHECK (`difficulty` BETWEEN 1 AND 10),
  CONSTRAINT `word_memory_known_check` CHECK (`known_override` in (0, 1))
);
--> statement-breakpoint
CREATE INDEX `word_memory_user_reviewed_idx` ON `word_memory` (`user_id`, `last_reviewed_at`);
--> statement-breakpoint
CREATE TABLE `practice_attempts` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `course_id` text NOT NULL,
  `lesson_id` text,
  `practice_kind` text NOT NULL,
  `practice_id` text NOT NULL,
  `item_index` integer NOT NULL,
  `prompt` text NOT NULL,
  `answer` text NOT NULL,
  `reference` text,
  `matched` integer,
  `ai_verdict` text,
  `ai_note` text,
  `source` text NOT NULL,
  `conversation_id` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`lesson_id`) REFERENCES `course_lessons`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `practice_attempts_kind_check` CHECK (`practice_kind` in ('lesson', 'ai')),
  CONSTRAINT `practice_attempts_source_check` CHECK (`source` in ('lesson', 'ai_chat', 'ai_practice')),
  CONSTRAINT `practice_attempts_verdict_check` CHECK (`ai_verdict` IS NULL OR `ai_verdict` in ('acceptable', 'error')),
  CONSTRAINT `practice_attempts_matched_check` CHECK (`matched` IS NULL OR `matched` in (0, 1)),
  CONSTRAINT `practice_attempts_item_check` CHECK (`item_index` >= 0),
  CONSTRAINT `practice_attempts_length_check` CHECK (length(`prompt`) <= 2000 AND length(`answer`) <= 2000 AND (`reference` IS NULL OR length(`reference`) <= 2000))
);
--> statement-breakpoint
CREATE INDEX `practice_attempts_user_created_idx` ON `practice_attempts` (`user_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `practice_attempts_user_lesson_idx` ON `practice_attempts` (`user_id`, `lesson_id`);
--> statement-breakpoint
-- Pronunciation attempts outlive their lesson: lesson deletion sets the lesson and word IDs to null.
CREATE TABLE `pronunciation_attempts` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `surface` text NOT NULL,
  `reference_text` text NOT NULL,
  `term_key` text,
  `lesson_id` text,
  `word_id` text,
  `overall` real NOT NULL,
  `accuracy` real NOT NULL,
  `fluency` real NOT NULL,
  `completeness` real NOT NULL,
  `word_scores` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`lesson_id`) REFERENCES `course_lessons`(`id`) ON UPDATE no action ON DELETE set null,
  CONSTRAINT `pronunciation_attempts_surface_check` CHECK (`surface` in ('drill', 'word_card', 'ai_chat')),
  CONSTRAINT `pronunciation_attempts_score_check` CHECK (
    `overall` BETWEEN 0 AND 100 AND `accuracy` BETWEEN 0 AND 100 AND `fluency` BETWEEN 0 AND 100 AND `completeness` BETWEEN 0 AND 100
  )
);
--> statement-breakpoint
CREATE INDEX `pronunciation_attempts_user_created_idx` ON `pronunciation_attempts` (`user_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `pronunciation_attempts_user_term_idx` ON `pronunciation_attempts` (`user_id`, `term_key`);
--> statement-breakpoint
-- Audit only, never read to undo. Course and lesson IDs carry no foreign key, so the audit outlives a deleted lesson.
CREATE TABLE `progress_events` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `actor` text NOT NULL,
  `kind` text NOT NULL,
  `course_id` text NOT NULL,
  `lesson_id` text NOT NULL,
  `conversation_id` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `progress_events_actor_check` CHECK (`actor` in ('user', 'agent')),
  CONSTRAINT `progress_events_kind_check` CHECK (`kind` in ('lesson_completed', 'lesson_reset'))
);
--> statement-breakpoint
CREATE INDEX `progress_events_user_created_idx` ON `progress_events` (`user_id`, `created_at`);
--> statement-breakpoint
-- Seeding (docs/words.md#word-memory): each C12 drill state becomes one `seed` review of its last result at its last drilled
-- time, keeping its box in `seed_box` so a rebuild reproduces the seeded stability. The term key comes from the word index.
-- SQLite cannot fold diacritics, so a word indexed before migration 0023 and never keyed since falls back to its lower-cased
-- term only when that term is plain single-spaced ASCII (exactly what `wordSearchKey` would give); other unkeyed words, and
-- states of words no longer in the index, are skipped. IDs are random version 4 UUIDs.
INSERT INTO `word_reviews` (`id`, `user_id`, `term_key`, `course_id`, `lesson_id`, `word_id`, `direction`, `result`, `source`, `seed_box`, `conversation_id`, `created_at`)
SELECT
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-'
    || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
  s.`user_id`, k.`term_key`, s.`course_id`, s.`lesson_id`, s.`word_id`, s.`direction`, s.`last_result`, 'seed', s.`box`, NULL, s.`last_drilled_at`
FROM `course_word_drill_states` s
JOIN (
  SELECT `course_id`, `lesson_id`, `word_id`, COALESCE(`term_key`,
    CASE WHEN `term` NOT GLOB '*[^ -~]*' AND trim(`term`) NOT LIKE '%  %' THEN lower(trim(`term`)) END) AS `term_key`
  FROM `course_lesson_words`
) k ON k.`course_id` = s.`course_id` AND k.`lesson_id` = s.`lesson_id` AND k.`word_id` = s.`word_id`
WHERE k.`term_key` IS NOT NULL AND k.`term_key` <> '';
--> statement-breakpoint
-- Memory rows fold the seed reviews of each term key and direction the way `foldWordReview` does: the newest seed (by time,
-- then ID) gives the representative word, the stability of its box (1: half a day, 2: 1, 3: 3, 4: 7, 5: 21 days), and the
-- last review time; difficulty starts at the engine's default; reps count the seeds; seeds are never lapses.
INSERT INTO `word_memory` (`user_id`, `term_key`, `direction`, `course_id`, `lesson_id`, `word_id`, `recent`, `reps`, `lapses`, `last_lapse_at`, `stability`, `difficulty`, `last_reviewed_at`, `known_override`)
SELECT
  o.`user_id`, o.`term_key`, o.`direction`, o.`course_id`, o.`lesson_id`, o.`word_id`,
  (SELECT group_concat(`mark`, '') FROM (
    SELECT `mark`, `created_at`, `id` FROM (
      SELECT CASE r.`result` WHEN 'got' THEN 'g' ELSE 'a' END AS `mark`, r.`created_at`, r.`id` FROM `word_reviews` r
      WHERE r.`user_id` = o.`user_id` AND r.`term_key` = o.`term_key` AND r.`direction` = o.`direction` AND r.`source` = 'seed'
      ORDER BY r.`created_at` DESC, r.`id` DESC LIMIT 10
    ) ORDER BY `created_at`, `id`
  )),
  o.`reps`, 0, NULL,
  CASE o.`seed_box` WHEN 1 THEN 0.5 WHEN 2 THEN 1.0 WHEN 3 THEN 3.0 WHEN 4 THEN 7.0 ELSE 21.0 END,
  5.1618, o.`created_at`, 0
FROM (
  SELECT r.*,
    row_number() OVER (PARTITION BY r.`user_id`, r.`term_key`, r.`direction` ORDER BY r.`created_at` DESC, r.`id` DESC) AS `newest`,
    count(*) OVER (PARTITION BY r.`user_id`, r.`term_key`, r.`direction`) AS `reps`
  FROM `word_reviews` r WHERE r.`source` = 'seed'
) o
WHERE o.`newest` = 1;
--> statement-breakpoint
DROP INDEX `course_word_drill_states_user_idx`;
--> statement-breakpoint
DROP TABLE `course_word_drill_states`;
