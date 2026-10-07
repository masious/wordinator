-- New words (C8): a derived index of the words in each lesson's published document, read by the course word recap.
-- The published document stays the source of truth. Publishing replaces a lesson's rows in the same batch, unpublishing and
-- lesson deletion remove them, and rows cascade from their course and lesson. `position` is the document order within the lesson.
-- No backfill: vocabulary blocks did not exist before this migration, so no published document contains words and the table starts empty.
CREATE TABLE `course_lesson_words` (
  `group_id` text NOT NULL,
  `course_id` text NOT NULL,
  `lesson_id` text NOT NULL,
  `block_id` text NOT NULL,
  `word_id` text NOT NULL,
  `position` integer NOT NULL,
  `term` text NOT NULL,
  `meaning` text NOT NULL,
  `forms` text,
  `example` text,
  `note` text,
  PRIMARY KEY (`lesson_id`, `word_id`),
  FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`lesson_id`) REFERENCES `course_lessons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `course_lesson_words_lesson_idx` ON `course_lesson_words` (`group_id`, `course_id`, `lesson_id`, `position`);
