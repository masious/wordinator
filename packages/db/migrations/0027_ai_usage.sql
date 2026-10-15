-- AI tutor metering (C14f, docs/data-model.md#ai_usage and #speech_usage). Account-level rows with no `group_id`, holding no
-- prompt, answer, or spoken text. `ai_usage.conversation_id` has no foreign key: conversations are never deleted, and their
-- table belongs to the tutor migration. `turn_start` marks the first model request of a tutor turn; the daily turn cap counts
-- those rows per UTC day.
CREATE TABLE `ai_usage` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `conversation_id` text,
  `provider` text NOT NULL,
  `model` text NOT NULL,
  `turn_start` integer DEFAULT false NOT NULL,
  `tokens_in` integer DEFAULT 0 NOT NULL,
  `tokens_out` integer DEFAULT 0 NOT NULL,
  `cost_microusd` integer DEFAULT 0 NOT NULL,
  `ok` integer NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  CONSTRAINT `ai_usage_provider_check` CHECK (`provider` in ('openrouter', 'workers_ai', 'azure'))
);
--> statement-breakpoint
CREATE INDEX `ai_usage_user_created_idx` ON `ai_usage` (`user_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `ai_usage_created_idx` ON `ai_usage` (`created_at`);
--> statement-breakpoint
CREATE TABLE `speech_usage` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `surface` text NOT NULL,
  `clip_hash` text NOT NULL,
  `characters` integer NOT NULL,
  `cached` integer NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  CONSTRAINT `speech_usage_surface_check` CHECK (`surface` in ('ai_message'))
);
--> statement-breakpoint
CREATE INDEX `speech_usage_user_created_idx` ON `speech_usage` (`user_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `speech_usage_created_idx` ON `speech_usage` (`created_at`);
