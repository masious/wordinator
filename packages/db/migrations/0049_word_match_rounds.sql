-- Word batch matching game (docs/words.md#matching-game): per learner and lesson batch, the last finished round, so the lesson page
-- shows its result on later visits. `word_ids` (JSON) are the batch's words then; a round whose words no longer match the batch is
-- not shown. `missed_ids` (JSON) are the words that were part of a miss. Its reviews are in `word_reviews`, as a drill's.
CREATE TABLE `word_match_rounds` (
  `user_id` text NOT NULL,
  `course_id` text NOT NULL,
  `lesson_id` text NOT NULL,
  `batch_number` integer NOT NULL,
  `word_ids` text NOT NULL,
  `missed_ids` text NOT NULL,
  `matches` integer NOT NULL,
  `tries` integer NOT NULL,
  `finished_at` integer NOT NULL,
  PRIMARY KEY (`user_id`, `lesson_id`, `batch_number`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`lesson_id`) REFERENCES `course_lessons`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `word_match_rounds_tries_check` CHECK (`matches` > 0 AND `tries` >= `matches`)
);
CREATE INDEX `word_match_rounds_lesson_idx` ON `word_match_rounds` (`lesson_id`);
