-- Learning time (C15, docs/learning-time.md, docs/data-model.md#learning_time): active seconds per account, local day, activity, and
-- target. The API builds `entry_key` from the day, activity, focus, course, lesson, and practice, so each send adds to one row.
-- `practice_id` has no foreign key, like `practice_attempts`: it is a practice block ID or an `ai_practices` ID.
CREATE TABLE `learning_time` (
  `user_id` text NOT NULL,
  `entry_key` text NOT NULL,
  `day` text NOT NULL,
  `activity` text NOT NULL,
  `focus` text,
  `course_id` text,
  `lesson_id` text,
  `practice_id` text,
  `seconds` integer NOT NULL,
  `updated_at` integer NOT NULL,
  PRIMARY KEY(`user_id`, `entry_key`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`lesson_id`) REFERENCES `course_lessons`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `learning_time_day_check` CHECK (`day` GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  CONSTRAINT `learning_time_seconds_check` CHECK (`seconds` > 0),
  CONSTRAINT `learning_time_activity_check` CHECK (
    (`activity` = 'reading' AND `focus` IN ('lesson', 'grammar') AND `course_id` IS NOT NULL AND `lesson_id` IS NOT NULL AND `practice_id` IS NULL)
    OR (`activity` = 'practice' AND `focus` IS NULL AND `course_id` IS NOT NULL AND `lesson_id` IS NOT NULL AND `practice_id` IS NOT NULL)
    OR (`activity` = 'ai_practice' AND `focus` IN ('grammar', 'vocabulary', 'reading', 'listening', 'writing') AND `course_id` IS NOT NULL AND `lesson_id` IS NOT NULL AND `practice_id` IS NOT NULL)
    OR (`activity` = 'drill' AND `focus` IS NULL AND `lesson_id` IS NULL AND `practice_id` IS NULL)
    OR (`activity` IN ('tutor', 'words') AND `focus` IS NULL AND `course_id` IS NULL AND `lesson_id` IS NULL AND `practice_id` IS NULL)
  )
);
--> statement-breakpoint
CREATE INDEX `learning_time_user_day_idx` ON `learning_time` (`user_id`, `day`);
--> statement-breakpoint
CREATE INDEX `learning_time_user_updated_idx` ON `learning_time` (`user_id`, `updated_at`);
--> statement-breakpoint
CREATE INDEX `learning_time_lesson_idx` ON `learning_time` (`lesson_id`, `activity`);
--> statement-breakpoint
-- Snapshots for the medians: reading time when the completion was recorded, and practice time at the save that finished a practice.
ALTER TABLE `course_lesson_completions` ADD `reading_seconds` integer;
--> statement-breakpoint
ALTER TABLE `course_practice_progress` ADD `done_seconds` integer;
--> statement-breakpoint
-- The skill an AI practice works on. Earlier practices take one from their kind.
ALTER TABLE `ai_practices` ADD `focus` text DEFAULT 'grammar' NOT NULL CONSTRAINT `ai_practices_focus_check` CHECK (`focus` in ('grammar', 'vocabulary', 'reading', 'listening', 'writing'));
--> statement-breakpoint
UPDATE `ai_practices` SET `focus` = CASE `kind` WHEN 'dictation' THEN 'listening' WHEN 'translate' THEN 'vocabulary' WHEN 'choice' THEN 'vocabulary' ELSE 'grammar' END;
--> statement-breakpoint
-- The learner's daily goal in minutes; null is no goal.
ALTER TABLE `learner_profiles` ADD `daily_goal_minutes` integer CONSTRAINT `learner_profiles_daily_goal_check` CHECK (`daily_goal_minutes` IS NULL OR `daily_goal_minutes` BETWEEN 5 AND 240);
