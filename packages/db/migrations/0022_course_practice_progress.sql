-- Practice answers are no longer shared (see docs/courses.md#practice-answers). Each learner keeps one progress row per
-- practice: how many of its questions they have answered. Answers themselves stay in the learner's local draft.
CREATE TABLE `course_practice_progress` (
	`practice_id` text NOT NULL,
	`group_id` text NOT NULL,
	`course_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`user_id` text NOT NULL,
	`answered` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`practice_id`, `user_id`),
	FOREIGN KEY (`practice_id`) REFERENCES `course_practices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lesson_id`) REFERENCES `course_lessons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "course_practice_progress_answered_check" CHECK(`answered` >= 0)
);
--> statement-breakpoint
CREATE INDEX `course_practice_progress_lesson_idx` ON `course_practice_progress` (`group_id`, `lesson_id`);
--> statement-breakpoint
-- Every shared answer set becomes progress for its author: the most items they answered in any one set.
INSERT INTO `course_practice_progress` (`practice_id`, `group_id`, `course_id`, `lesson_id`, `user_id`, `answered`, `updated_at`)
SELECT `p`.`id`, `p`.`group_id`, `p`.`course_id`, `p`.`lesson_id`, `c`.`author_id`,
	MAX((SELECT COUNT(*) FROM `comment_response_items` `i` WHERE `i`.`comment_id` = `c`.`id` AND `i`.`skipped` = 0)),
	MAX(`c`.`updated_at`)
FROM `comments` `c` JOIN `course_practices` `p` ON `p`.`id` = `c`.`block_id`
WHERE `c`.`kind` = 'practice_response' AND `c`.`parent_comment_id` IS NULL
GROUP BY `p`.`id`, `c`.`author_id`;
--> statement-breakpoint
-- The shared answer sets, their replies, and their reactions are deleted. Reactions have no foreign key, so they go first;
-- response items cascade from their comments.
DELETE FROM `reactions` WHERE `target_kind` = 'comment' AND `target_id` IN (SELECT `id` FROM `comments` WHERE `block_id` IS NOT NULL);
--> statement-breakpoint
DELETE FROM `comments` WHERE `block_id` IS NOT NULL;
