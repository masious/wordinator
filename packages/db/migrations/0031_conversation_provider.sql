-- Per-conversation model (docs/ai-tutor.md#providers-and-fallback, docs/data-model.md#ai_conversations): the provider whose
-- configured model leads the conversation's turns. NULL follows the superuser's order.
ALTER TABLE `ai_conversations` ADD `provider` text CONSTRAINT `ai_conversations_provider_check` CHECK (`provider` is null or `provider` in ('openrouter', 'workers_ai', 'azure'));
