-- Conversation titles (docs/ai-tutor.md#conversation-titles, docs/data-model.md#ai_conversations): who set the title. `auto` is the
-- first user message, `tutor` a title the tutor chose, `user` one the learner typed, which the tutor never replaces.
ALTER TABLE `ai_conversations` ADD `title_source` text DEFAULT 'auto' NOT NULL CONSTRAINT `ai_conversations_title_source_check` CHECK (`title_source` in ('auto', 'tutor', 'user'));
-- Each conversation's token total in the conversation list (docs/ai-tutor.md#usage-box) sums its `ai_usage` rows.
CREATE INDEX `ai_usage_conversation_idx` ON `ai_usage` (`conversation_id`);
