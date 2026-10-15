-- AI tutor conversations, messages, and tutor profiles (C14g, docs/data-model.md#ai-tutor, docs/ai-tutor.md). Account-level
-- rows with no `group_id`. Conversations are never deleted (archive only); messages cascade from their conversation. Message
-- parts are JSON text validated by the contracts' `tutor` subpath.
CREATE TABLE `ai_conversations` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `title` text DEFAULT '' NOT NULL,
  `archived_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ai_conversations_user_archived_updated_idx` ON `ai_conversations` (`user_id`, `archived_at`, `updated_at`);
--> statement-breakpoint
CREATE TABLE `ai_messages` (
  `id` text PRIMARY KEY NOT NULL,
  `conversation_id` text NOT NULL,
  `user_id` text NOT NULL,
  `role` text NOT NULL,
  `parts` text NOT NULL,
  `status` text NOT NULL,
  `provider` text,
  `model` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`conversation_id`) REFERENCES `ai_conversations`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `ai_messages_role_check` CHECK (`role` in ('user', 'assistant')),
  CONSTRAINT `ai_messages_status_check` CHECK (`status` in ('complete', 'awaiting_user', 'error'))
);
--> statement-breakpoint
CREATE INDEX `ai_messages_conversation_created_idx` ON `ai_messages` (`conversation_id`, `created_at`, `id`);
--> statement-breakpoint
CREATE TABLE `learner_profiles` (
  `user_id` text PRIMARY KEY NOT NULL,
  `native_language` text DEFAULT 'en' NOT NULL,
  `reply_language` text DEFAULT 'native' NOT NULL,
  `goals` text,
  `tutor_notes` text,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `learner_profiles_reply_language_check` CHECK (`reply_language` in ('native', 'target', 'mixed'))
);
