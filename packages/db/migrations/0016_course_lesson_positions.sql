-- Course progress at step level: one row per member and published lesson they have started in the lesson player but not finished.
-- `step_key` and `step_index` are the last step shown, for resuming. `passed_steps` of `total_steps` is the furthest share passed,
-- which counts toward course progress. Finishing the lesson deletes the row; the completion then counts the whole lesson.
CREATE TABLE `course_lesson_positions` (
  `group_id` text NOT NULL,
  `course_id` text NOT NULL,
  `lesson_id` text NOT NULL,
  `user_id` text NOT NULL,
  `step_key` text NOT NULL,
  `step_index` integer NOT NULL,
  `passed_steps` integer NOT NULL,
  `total_steps` integer NOT NULL,
  `updated_at` integer NOT NULL,
  PRIMARY KEY (`lesson_id`, `user_id`),
  FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`lesson_id`) REFERENCES `course_lessons`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  CONSTRAINT `course_lesson_positions_steps_check` CHECK (`total_steps` > 0 AND `passed_steps` BETWEEN 0 AND `total_steps` - 1 AND `step_index` BETWEEN 0 AND `total_steps` - 1)
);
--> statement-breakpoint
CREATE INDEX `course_lesson_positions_course_idx` ON `course_lesson_positions` (`group_id`, `course_id`, `user_id`);
