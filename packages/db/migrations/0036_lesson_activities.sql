-- Shared lesson activity cache, private runs/answers, and short-lived quota reservations.
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
  CONSTRAINT `lesson_activities_type_check` CHECK (`activity_type` IN ('story_summary','story_comprehension','grammar_explanation','quick_grammar','tricky_grammar','mixed_practice','roleplay')),
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
--> statement-breakpoint
CREATE TABLE `ai_turn_reservations` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE cascade,
  `cache_key` text NOT NULL,
  `day_start` integer NOT NULL,
  `expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_turn_reservations_user_cache_day_unique` ON `ai_turn_reservations` (`user_id`,`cache_key`,`day_start`);
--> statement-breakpoint
CREATE INDEX `ai_turn_reservations_user_day_expiry_idx` ON `ai_turn_reservations` (`user_id`,`day_start`,`expires_at`);
--> statement-breakpoint
-- Extend C15 targets with lesson activities; keep focus per row and aggregate it with the existing AI activity totals.
ALTER TABLE `learning_time` RENAME TO `learning_time_old`;
--> statement-breakpoint
CREATE TABLE `learning_time` (
  `user_id` text NOT NULL,
  `entry_key` text NOT NULL,
  `day` text NOT NULL,
  `activity` text NOT NULL,
  `focus` text,
  `course_id` text REFERENCES `courses`(`id`) ON DELETE cascade,
  `lesson_id` text REFERENCES `course_lessons`(`id`) ON DELETE cascade,
  `practice_id` text,
  `seconds` integer NOT NULL,
  `updated_at` integer NOT NULL,
  PRIMARY KEY (`user_id`,`entry_key`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade,
  CONSTRAINT `learning_time_day_check` CHECK (`day` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  CONSTRAINT `learning_time_seconds_check` CHECK (`seconds` > 0),
  CONSTRAINT `learning_time_activity_check` CHECK (
    (`activity` = 'reading' AND `focus` IN ('lesson','grammar') AND `course_id` IS NOT NULL AND `lesson_id` IS NOT NULL AND `practice_id` IS NULL)
    OR (`activity` = 'practice' AND `focus` IS NULL AND `course_id` IS NOT NULL AND `lesson_id` IS NOT NULL AND `practice_id` IS NOT NULL)
    OR (`activity` = 'ai_practice' AND `focus` IN ('grammar','vocabulary','reading','listening','writing') AND `course_id` IS NOT NULL AND `lesson_id` IS NOT NULL AND `practice_id` IS NOT NULL)
    OR (`activity` = 'lesson_activity' AND `focus` IS NOT NULL AND `focus` IN ('reading','grammar','speaking') AND `course_id` IS NOT NULL AND `lesson_id` IS NOT NULL AND `practice_id` IS NOT NULL)
    OR (`activity` = 'drill' AND `focus` IS NULL AND `lesson_id` IS NULL AND `practice_id` IS NULL)
    OR (`activity` IN ('tutor','words') AND `focus` IS NULL AND `course_id` IS NULL AND `lesson_id` IS NULL AND `practice_id` IS NULL)
  )
);
--> statement-breakpoint
INSERT INTO `learning_time` SELECT * FROM `learning_time_old`;
--> statement-breakpoint
DROP TABLE `learning_time_old`;
--> statement-breakpoint
CREATE INDEX `learning_time_user_day_idx` ON `learning_time` (`user_id`,`day`);
--> statement-breakpoint
CREATE INDEX `learning_time_user_updated_idx` ON `learning_time` (`user_id`,`updated_at`);
--> statement-breakpoint
CREATE INDEX `learning_time_lesson_idx` ON `learning_time` (`lesson_id`,`activity`);
