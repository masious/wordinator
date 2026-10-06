-- Course progress: one row per member and lesson the member has finished in the lesson player.
-- Progress is derived from these rows over the currently published lessons, so nothing else stores a percentage.
CREATE TABLE `course_lesson_completions` (
  `group_id` text NOT NULL,
  `course_id` text NOT NULL,
  `lesson_id` text NOT NULL,
  `user_id` text NOT NULL,
  `completed_at` integer NOT NULL,
  PRIMARY KEY (`lesson_id`, `user_id`),
  FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`lesson_id`) REFERENCES `course_lessons`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `course_lesson_completions_course_idx` ON `course_lesson_completions` (`group_id`, `course_id`, `user_id`);
