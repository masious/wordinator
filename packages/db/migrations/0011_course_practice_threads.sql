-- Phase C3: practice blocks and practice answer threads.
-- SQLite cannot change CHECK constraints or column nullability in place, so course_blocks and comments are rebuilt.
-- Dropping a parent table may fire ON DELETE CASCADE on its children, and the self-referencing comments table cascades onto
-- itself, so comments and their children are copied into constraint-free backup tables and restored after the rename.
PRAGMA defer_foreign_keys = on;
--> statement-breakpoint
CREATE TABLE `course_blocks_new` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`course_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`position` integer NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`payload_version` integer NOT NULL,
	`published` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lesson_id`) REFERENCES `course_lessons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "course_blocks_kind_check" CHECK(`kind` in ('heading', 'text', 'example', 'dialogue', 'practice')),
	CONSTRAINT "course_blocks_payload_check" CHECK(json_valid(`payload`))
);
--> statement-breakpoint
INSERT INTO `course_blocks_new` SELECT `id`, `group_id`, `course_id`, `lesson_id`, `position`, `kind`, `payload`, `payload_version`, `published`, `version`, `created_by`, `updated_by`, `created_at`, `updated_at` FROM `course_blocks`;
--> statement-breakpoint
DROP TABLE `course_blocks`;
--> statement-breakpoint
ALTER TABLE `course_blocks_new` RENAME TO `course_blocks`;
--> statement-breakpoint
CREATE INDEX `course_blocks_lesson_position_idx` ON `course_blocks` (`group_id`,`lesson_id`,`position`);
--> statement-breakpoint
CREATE TABLE `comments_backup` AS SELECT * FROM `comments`;
--> statement-breakpoint
CREATE TABLE `comment_response_items_backup` AS SELECT * FROM `comment_response_items`;
--> statement-breakpoint
CREATE TABLE `post_pins_backup` AS SELECT * FROM `post_pins`;
--> statement-breakpoint
CREATE TABLE `comments_new` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`post_id` text,
	`block_id` text,
	`author_id` text NOT NULL,
	`parent_comment_id` text,
	`kind` text NOT NULL,
	`body` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`),
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON DELETE cascade,
	FOREIGN KEY (`block_id`) REFERENCES `course_blocks`(`id`) ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`),
	FOREIGN KEY (`parent_comment_id`) REFERENCES `comments`(`id`) ON DELETE cascade,
	CONSTRAINT `comments_kind_check` CHECK (`kind` in ('text', 'reading_response', 'fill_response', 'practice_response')),
	CONSTRAINT `comments_target_check` CHECK ((`post_id` IS NULL) <> (`block_id` IS NULL))
);
--> statement-breakpoint
DROP TABLE `comments`;
--> statement-breakpoint
ALTER TABLE `comments_new` RENAME TO `comments`;
--> statement-breakpoint
INSERT INTO `comments` (`id`, `group_id`, `post_id`, `block_id`, `author_id`, `parent_comment_id`, `kind`, `body`, `created_at`, `updated_at`)
SELECT `id`, `group_id`, `post_id`, NULL, `author_id`, `parent_comment_id`, `kind`, `body`, `created_at`, `updated_at` FROM `comments_backup`;
--> statement-breakpoint
CREATE INDEX `comments_group_post_parent_idx` ON `comments` (`group_id`,`post_id`,`parent_comment_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `comments_group_block_parent_idx` ON `comments` (`group_id`,`block_id`,`parent_comment_id`,`created_at`,`id`);
--> statement-breakpoint
DELETE FROM `comment_response_items`;
--> statement-breakpoint
INSERT INTO `comment_response_items` (`comment_id`, `position`, `prompt`, `answer`, `skipped`, `matched`)
SELECT `comment_id`, `position`, `prompt`, `answer`, `skipped`, `matched` FROM `comment_response_items_backup`;
--> statement-breakpoint
DELETE FROM `post_pins`;
--> statement-breakpoint
INSERT INTO `post_pins` (`post_id`, `comment_id`, `pinned_by_user_id`, `created_at`)
SELECT `post_id`, `comment_id`, `pinned_by_user_id`, `created_at` FROM `post_pins_backup`;
--> statement-breakpoint
DROP TABLE `comments_backup`;
--> statement-breakpoint
DROP TABLE `comment_response_items_backup`;
--> statement-breakpoint
DROP TABLE `post_pins_backup`;
--> statement-breakpoint
PRAGMA defer_foreign_keys = off;
