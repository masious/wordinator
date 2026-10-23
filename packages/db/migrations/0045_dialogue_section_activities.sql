PRAGMA defer_foreign_keys = on;
--> statement-breakpoint
-- Dialogue sections offer two activities, review words and read aloud (docs/lesson-activities.md#activity-catalogue). Story
-- summary, speak from English and role-play are retired, and read aloud's old payload (every line, prose included) is replaced,
-- so their shared activities, runs and answers are deleted. The type check must admit review_words, and SQLite cannot change a
-- check in place, so the three tables are rebuilt. Dropping a parent fires ON DELETE CASCADE on its children, so the kept rows
-- (guided grammar, tricky grammar, mixed practice) are copied into constraint-free tables first and restored after, as in 0015.
-- Runs gain `reader`, the speaker a read-aloud run reads (null: every line), and lose `cue_mode`, which only role-play used.
CREATE TABLE `lesson_activities_keep` AS SELECT * FROM `lesson_activities` WHERE `activity_type` IN ('tricky_grammar','mixed_practice','guided_grammar');
--> statement-breakpoint
CREATE TABLE `lesson_activity_runs_keep` AS SELECT r.* FROM `lesson_activity_runs` r JOIN `lesson_activities_keep` a ON a.`id` = r.`activity_id`;
--> statement-breakpoint
CREATE TABLE `lesson_activity_answers_keep` AS SELECT x.* FROM `lesson_activity_answers` x JOIN `lesson_activity_runs_keep` r ON r.`id` = x.`run_id`;
--> statement-breakpoint
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
  `generated_by` text,
  CONSTRAINT `lesson_activities_type_check` CHECK (`activity_type` IN ('tricky_grammar','mixed_practice','guided_grammar','read_aloud','review_words')),
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
  `reader` text,
  `status` text NOT NULL DEFAULT 'active',
  `started_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  `completed_at` integer,
  `metrics_before` text,
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
--> statement-breakpoint
INSERT INTO `lesson_activities` (`id`,`lesson_id`,`course_id`,`source_id`,`activity_type`,`source_fingerprint`,`recipe_version`,`schema_version`,`language`,`cache_key`,`status`,`lease_token`,`lease_expires_at`,`next_attempt_at`,`payload`,`created_at`,`updated_at`,`generated_by`)
SELECT `id`,`lesson_id`,`course_id`,`source_id`,`activity_type`,`source_fingerprint`,`recipe_version`,`schema_version`,`language`,`cache_key`,`status`,`lease_token`,`lease_expires_at`,`next_attempt_at`,`payload`,`created_at`,`updated_at`,`generated_by` FROM `lesson_activities_keep`;
--> statement-breakpoint
INSERT INTO `lesson_activity_runs` (`id`,`activity_id`,`user_id`,`cursor`,`reader`,`status`,`started_at`,`updated_at`,`completed_at`,`metrics_before`)
SELECT `id`,`activity_id`,`user_id`,`cursor`,NULL,`status`,`started_at`,`updated_at`,`completed_at`,`metrics_before` FROM `lesson_activity_runs_keep`;
--> statement-breakpoint
INSERT INTO `lesson_activity_answers` (`id`,`run_id`,`item_id`,`idempotency_key`,`answer`,`input_mode`,`correct`,`matched`,`reference`,`pronunciation_json`,`created_at`)
SELECT `id`,`run_id`,`item_id`,`idempotency_key`,`answer`,`input_mode`,`correct`,`matched`,`reference`,`pronunciation_json`,`created_at` FROM `lesson_activity_answers_keep`;
--> statement-breakpoint
DROP TABLE `lesson_activity_answers_keep`;
--> statement-breakpoint
DROP TABLE `lesson_activity_runs_keep`;
--> statement-breakpoint
DROP TABLE `lesson_activities_keep`;
--> statement-breakpoint
PRAGMA defer_foreign_keys = off;
