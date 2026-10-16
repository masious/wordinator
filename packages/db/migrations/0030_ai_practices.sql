-- AI practices (C14h, docs/data-model.md#ai_practices, docs/courses.md#ai-practices): practices the AI tutor saved with the
-- learner's confirmation, and the lessons they are tagged to. Account-level rows with no `group_id`. `payload` is JSON text
-- validated by the contracts' `tutor` subpath and includes the reference answer. `conversation_id` has no foreign key, like
-- `ai_usage`: conversations are never deleted. Tags cascade from their practice, course, and lesson; the API deletes a practice
-- left without tags in the same batch.
CREATE TABLE `ai_practices` (
  `id` text PRIMARY KEY NOT NULL,
  `kind` text NOT NULL,
  `payload` text NOT NULL,
  `created_by_user_id` text NOT NULL,
  `conversation_id` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `ai_practices_kind_check` CHECK (`kind` in ('fill_in', 'translate', 'word_order', 'article', 'choice', 'dictation', 'fix_mistake'))
);
--> statement-breakpoint
CREATE TABLE `ai_practice_lessons` (
  `practice_id` text NOT NULL,
  `lesson_id` text NOT NULL,
  `course_id` text NOT NULL,
  `after_block_id` text NOT NULL,
  `position` integer NOT NULL,
  PRIMARY KEY(`practice_id`, `lesson_id`),
  FOREIGN KEY (`practice_id`) REFERENCES `ai_practices`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`lesson_id`) REFERENCES `course_lessons`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `ai_practice_lessons_position_check` CHECK (`position` >= 0)
);
--> statement-breakpoint
CREATE INDEX `ai_practice_lessons_lesson_anchor_idx` ON `ai_practice_lessons` (`lesson_id`, `after_block_id`, `position`);
--> statement-breakpoint
CREATE INDEX `ai_practice_lessons_course_idx` ON `ai_practice_lessons` (`course_id`);
--> statement-breakpoint
-- On-demand speech of an AI practice dictation is metered with its own surface. SQLite cannot change a check constraint in
-- place, so `speech_usage` is rebuilt with the wider check; no table refers to it.
CREATE TABLE `speech_usage_new` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `surface` text NOT NULL,
  `clip_hash` text NOT NULL,
  `characters` integer NOT NULL,
  `cached` integer NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  CONSTRAINT `speech_usage_surface_check` CHECK (`surface` in ('ai_message', 'ai_practice'))
);
--> statement-breakpoint
INSERT INTO `speech_usage_new` (`id`, `user_id`, `surface`, `clip_hash`, `characters`, `cached`, `created_at`)
  SELECT `id`, `user_id`, `surface`, `clip_hash`, `characters`, `cached`, `created_at` FROM `speech_usage`;
--> statement-breakpoint
DROP TABLE `speech_usage`;
--> statement-breakpoint
ALTER TABLE `speech_usage_new` RENAME TO `speech_usage`;
--> statement-breakpoint
CREATE INDEX `speech_usage_user_created_idx` ON `speech_usage` (`user_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `speech_usage_created_idx` ON `speech_usage` (`created_at`);
