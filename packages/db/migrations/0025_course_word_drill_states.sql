-- Drill states (C12, docs/words.md#memory-leitner-boxes): an account's latest Leitner box per word and direction. Like a
-- bookmark, a row is a key into `course_lesson_words` with deliberately no foreign key to it, so a word missing from the index
-- is skipped, not deleted, and the row survives removing the bookmark. Rows cascade from their course and lesson, and lesson
-- deletion also removes them in its batch. No `group_id`: new work under the storage compatibility rule. No backfill.
CREATE TABLE `course_word_drill_states` (
  `user_id` text NOT NULL,
  `course_id` text NOT NULL,
  `lesson_id` text NOT NULL,
  `word_id` text NOT NULL,
  `direction` text NOT NULL,
  `box` integer NOT NULL,
  `last_result` text NOT NULL,
  `last_drilled_at` integer NOT NULL,
  PRIMARY KEY (`user_id`, `lesson_id`, `word_id`, `direction`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`lesson_id`) REFERENCES `course_lessons`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `course_word_drill_states_direction_check` CHECK (`direction` in ('understand', 'produce')),
  CONSTRAINT `course_word_drill_states_result_check` CHECK (`last_result` in ('got', 'again')),
  CONSTRAINT `course_word_drill_states_box_check` CHECK (`box` BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE INDEX `course_word_drill_states_user_idx` ON `course_word_drill_states` (`user_id`, `direction`, `box`, `last_drilled_at`);
