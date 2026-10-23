-- Workers AI is no longer a tutor provider (docs/ai-tutor.md#providers-and-fallback). Its usage rows are deleted and `ai_usage`
-- is rebuilt with the narrower check; no table refers to it. `ai_conversations` keeps its check, because rebuilding it would
-- cascade-delete its messages, so its `workers_ai` choices and the message labels are cleared instead. The stored AI settings
-- lose their Workers AI entry; a value left with no enabled provider is invalid and reads as the defaults.
DELETE FROM `ai_usage` WHERE `provider` = 'workers_ai';
--> statement-breakpoint
CREATE TABLE `ai_usage_new` (
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
  CONSTRAINT `ai_usage_provider_check` CHECK (`provider` in ('openrouter', 'azure'))
);
--> statement-breakpoint
INSERT INTO `ai_usage_new` (`id`, `user_id`, `conversation_id`, `provider`, `model`, `turn_start`, `tokens_in`, `tokens_out`, `cost_microusd`, `ok`, `created_at`)
  SELECT `id`, `user_id`, `conversation_id`, `provider`, `model`, `turn_start`, `tokens_in`, `tokens_out`, `cost_microusd`, `ok`, `created_at` FROM `ai_usage`;
--> statement-breakpoint
DROP TABLE `ai_usage`;
--> statement-breakpoint
ALTER TABLE `ai_usage_new` RENAME TO `ai_usage`;
--> statement-breakpoint
CREATE INDEX `ai_usage_user_created_idx` ON `ai_usage` (`user_id`, `created_at`);
--> statement-breakpoint
CREATE INDEX `ai_usage_created_idx` ON `ai_usage` (`created_at`);
--> statement-breakpoint
CREATE INDEX `ai_usage_conversation_idx` ON `ai_usage` (`conversation_id`);
--> statement-breakpoint
UPDATE `ai_conversations` SET `provider` = NULL WHERE `provider` = 'workers_ai';
--> statement-breakpoint
UPDATE `ai_messages` SET `provider` = NULL, `model` = NULL WHERE `provider` = 'workers_ai';
--> statement-breakpoint
UPDATE `platform_metadata` SET `value` = json_set(`value`, '$.providers', (
  SELECT json_group_array(json(`entry`.`value`)) FROM json_each(`platform_metadata`.`value`, '$.providers') AS `entry`
  WHERE json_extract(`entry`.`value`, '$.provider') <> 'workers_ai'
)) WHERE `key` = 'ai_settings' AND json_valid(`value`);
