-- Word hints (docs/ai-tutor.md#word-hints, docs/data-model.md#practice_attempts): how many of a component's word hints the learner
-- opened before answering. Lesson practice attempts and older rows keep 0.
ALTER TABLE `practice_attempts` ADD `hints_used` integer DEFAULT 0 NOT NULL CONSTRAINT `practice_attempts_hints_check` CHECK (`hints_used` >= 0 AND `hints_used` <= 4);
