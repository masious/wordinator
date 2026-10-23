-- Word batch Peek (docs/words.md#word-batches): per learner and lesson word, how often it was looked at, when last, and whether
-- it was marked known there. Exposure never changes word memory; `known_at` stands for "I know this word" on a word without memory.
CREATE TABLE `word_exposures` (
  `user_id` text NOT NULL,
  `course_id` text NOT NULL,
  `lesson_id` text NOT NULL,
  `word_id` text NOT NULL,
  `term_key` text NOT NULL,
  `seen_count` integer DEFAULT 0 NOT NULL,
  `last_seen_at` integer,
  `known_at` integer,
  PRIMARY KEY (`user_id`, `lesson_id`, `word_id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`lesson_id`) REFERENCES `course_lessons`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `word_exposures_seen_check` CHECK (`seen_count` >= 0)
);
CREATE INDEX `word_exposures_user_term_idx` ON `word_exposures` (`user_id`, `term_key`);
CREATE INDEX `word_exposures_lesson_idx` ON `word_exposures` (`lesson_id`);
