-- Role-play dialogue audio of a lesson activity is metered with its own surface (docs/speech.md#lesson-activity-role-play). SQLite
-- cannot change a check constraint in place, so `speech_usage` is rebuilt with the wider check; no table refers to it.
CREATE TABLE `speech_usage_new` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `surface` text NOT NULL,
  `clip_hash` text NOT NULL,
  `characters` integer NOT NULL,
  `cached` integer NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  CONSTRAINT `speech_usage_surface_check` CHECK (`surface` in ('ai_message', 'ai_practice', 'lesson_activity'))
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
