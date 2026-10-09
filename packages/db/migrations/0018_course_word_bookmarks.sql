-- Word bookmarks (C9b): a member's saved words, keyed by lesson and word ID. A row is a key only; the word's text is read from
-- `course_lesson_words` at read time. There is deliberately no foreign key to that table, because publishing replaces a lesson's
-- word rows and would cascade bookmarks away: a bookmark whose word is not indexed is hidden, not deleted, and returns when a
-- later publish brings the word ID back. Rows cascade from their course and lesson, lesson deletion also removes them in its
-- batch, and they stay when a member leaves the group. No backfill: bookmarks are new.
CREATE TABLE `course_word_bookmarks` (
  `group_id` text NOT NULL,
  `course_id` text NOT NULL,
  `lesson_id` text NOT NULL,
  `word_id` text NOT NULL,
  `user_id` text NOT NULL,
  `created_at` integer NOT NULL,
  PRIMARY KEY (`user_id`, `lesson_id`, `word_id`),
  FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`lesson_id`) REFERENCES `course_lessons`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `course_word_bookmarks_user_idx` ON `course_word_bookmarks` (`group_id`, `user_id`, `created_at`);
