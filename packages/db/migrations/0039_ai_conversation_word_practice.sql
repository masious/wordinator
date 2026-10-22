-- Word practice conversations (experimental, docs pending): the words a learner picked after a drill, as JSON
-- `[{ lessonId, wordId, term, source }]`. NULL on every other conversation.
ALTER TABLE `ai_conversations` ADD `word_practice` text;
