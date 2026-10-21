PRAGMA defer_foreign_keys = on;
--> statement-breakpoint
-- Lesson activities v2: the shipped type list changes (quick_grammar is retired, three types are added) and runs keep a metrics snapshot.
-- SQLite cannot change a check constraint in place, and no production data exists, so the three tables are dropped children first and recreated empty.
DROP TABLE `lesson_activity_answers`;
--> statement-breakpoint
DROP TABLE `lesson_activity_runs`;
--> statement-breakpoint
DROP TABLE `lesson_activities`;
--> statement-breakpoint
CREATE TABLE `lesson_activities` (
  `id` text PRIMARY KEY NOT NULL,
  `lesson_id` text NOT NULL REFERENCES `course_lessons`(`id`) ON DELETE cascade,
  `course_id` text NOT NULL REFERENCES `courses`(`id`) ON DELETE cascade,
  `source_id` text NOT NULL,
  `activity_type` text NOT NULL,
  `source_fingerprint` text NOT NULL,
  `recipe_version` integer NOT NULL,
  `schema_version` integer NOT NULL,
  `language` text NOT NULL,
  `cache_key` text NOT NULL,
  `status` text NOT NULL,
  `lease_token` text,
  `lease_expires_at` integer,
  `next_attempt_at` integer,
  `payload` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  CONSTRAINT `lesson_activities_type_check` CHECK (`activity_type` IN ('story_summary','story_comprehension','grammar_explanation','tricky_grammar','mixed_practice','roleplay','guided_grammar','read_aloud','speak_from_english')),
  CONSTRAINT `lesson_activities_status_check` CHECK (`status` IN ('generating','ready','failed')),
  CONSTRAINT `lesson_activities_language_check` CHECK (`language` IN ('nl','de')),
  CONSTRAINT `lesson_activities_lease_check` CHECK ((`status` = 'generating') = (`lease_token` IS NOT NULL AND `lease_expires_at` IS NOT NULL)),
  CONSTRAINT `lesson_activities_payload_check` CHECK ((`status` = 'ready') = (`payload` IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lesson_activities_cache_key_unique` ON `lesson_activities` (`cache_key`);
--> statement-breakpoint
CREATE INDEX `lesson_activities_lesson_idx` ON `lesson_activities` (`lesson_id`);
--> statement-breakpoint
CREATE TABLE `lesson_activity_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `activity_id` text NOT NULL REFERENCES `lesson_activities`(`id`) ON DELETE cascade,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE cascade,
  `cursor` integer NOT NULL DEFAULT 0,
  `cue_mode` text NOT NULL DEFAULT 'english',
  `status` text NOT NULL DEFAULT 'active',
  `started_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `completed_at` integer,
  `metrics_before` text,
  CONSTRAINT `lesson_activity_runs_cue_check` CHECK (`cue_mode` IN ('english','dutch')),
  CONSTRAINT `lesson_activity_runs_status_check` CHECK (`status` IN ('active','completed')),
  CONSTRAINT `lesson_activity_runs_cursor_check` CHECK (`cursor` >= 0),
  CONSTRAINT `lesson_activity_runs_completed_check` CHECK ((`status` = 'completed') = (`completed_at` IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lesson_activity_runs_activity_user_unique` ON `lesson_activity_runs` (`activity_id`,`user_id`);
--> statement-breakpoint
CREATE INDEX `lesson_activity_runs_user_idx` ON `lesson_activity_runs` (`user_id`,`updated_at`);
--> statement-breakpoint
CREATE TABLE `lesson_activity_answers` (
  `id` text PRIMARY KEY NOT NULL,
  `run_id` text NOT NULL REFERENCES `lesson_activity_runs`(`id`) ON DELETE cascade,
  `item_id` text NOT NULL,
  `idempotency_key` text NOT NULL,
  `answer` text NOT NULL,
  `input_mode` text NOT NULL,
  `correct` integer NOT NULL,
  `matched` integer NOT NULL,
  `reference` text,
  `pronunciation_json` text,
  `created_at` integer NOT NULL,
  CONSTRAINT `lesson_activity_answers_input_check` CHECK (`input_mode` IN ('typed','spoken')),
  CONSTRAINT `lesson_activity_answers_boolean_check` CHECK (`correct` IN (0,1) AND `matched` IN (0,1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lesson_activity_answers_run_idempotency_unique` ON `lesson_activity_answers` (`run_id`,`idempotency_key`);
--> statement-breakpoint
CREATE INDEX `lesson_activity_answers_run_item_idx` ON `lesson_activity_answers` (`run_id`,`item_id`,`created_at`);
