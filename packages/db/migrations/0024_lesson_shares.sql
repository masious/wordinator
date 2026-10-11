-- Phase C11a: lesson shares (docs/lesson-shares.md).
-- SQLite cannot change a CHECK constraint in place, so posts is rebuilt to allow the `lesson_share` type, as in 0012.
-- Dropping posts fires ON DELETE CASCADE on its children, so they are copied into constraint-free backup tables and restored
-- after the rename.
PRAGMA defer_foreign_keys = on;
--> statement-breakpoint
CREATE TABLE `reading_questions_backup` AS SELECT * FROM `reading_questions`;
--> statement-breakpoint
CREATE TABLE `fill_expected_answers_backup` AS SELECT * FROM `fill_expected_answers`;
--> statement-breakpoint
CREATE TABLE `comments_backup` AS SELECT * FROM `comments`;
--> statement-breakpoint
CREATE TABLE `comment_response_items_backup` AS SELECT * FROM `comment_response_items`;
--> statement-breakpoint
CREATE TABLE `post_pins_backup` AS SELECT * FROM `post_pins`;
--> statement-breakpoint
CREATE TABLE `posts_new` (
  `id` text PRIMARY KEY NOT NULL,
  `group_id` text NOT NULL,
  `author_id` text NOT NULL,
  `type` text NOT NULL,
  `body` text NOT NULL,
  `notes` text,
  `course_id` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action,
  CONSTRAINT `posts_type_check` CHECK (`type` in ('shared_sentence', 'question', 'reading', 'fill_in', 'course', 'lesson_share')),
  CONSTRAINT `posts_course_link_check` CHECK ((`type` = 'course') = (`course_id` IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `posts_new` (`id`, `group_id`, `author_id`, `type`, `body`, `notes`, `course_id`, `created_at`, `updated_at`)
SELECT `id`, `group_id`, `author_id`, `type`, `body`, `notes`, `course_id`, `created_at`, `updated_at` FROM `posts`;
--> statement-breakpoint
DROP TABLE `posts`;
--> statement-breakpoint
ALTER TABLE `posts_new` RENAME TO `posts`;
--> statement-breakpoint
CREATE INDEX `posts_group_feed_idx` ON `posts` (`group_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `posts_group_author_idx` ON `posts` (`group_id`,`author_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `posts_course_unique` ON `posts` (`course_id`);
--> statement-breakpoint
DELETE FROM `post_pins`;
--> statement-breakpoint
DELETE FROM `comment_response_items`;
--> statement-breakpoint
DELETE FROM `comments`;
--> statement-breakpoint
DELETE FROM `reading_questions`;
--> statement-breakpoint
DELETE FROM `fill_expected_answers`;
--> statement-breakpoint
INSERT INTO `reading_questions` (`id`, `post_id`, `position`, `text`)
SELECT `id`, `post_id`, `position`, `text` FROM `reading_questions_backup`;
--> statement-breakpoint
INSERT INTO `fill_expected_answers` (`post_id`, `position`, `text`)
SELECT `post_id`, `position`, `text` FROM `fill_expected_answers_backup`;
--> statement-breakpoint
INSERT INTO `comments` (`id`, `group_id`, `post_id`, `block_id`, `author_id`, `parent_comment_id`, `kind`, `body`, `created_at`, `updated_at`)
SELECT `id`, `group_id`, `post_id`, `block_id`, `author_id`, `parent_comment_id`, `kind`, `body`, `created_at`, `updated_at` FROM `comments_backup`;
--> statement-breakpoint
INSERT INTO `comment_response_items` (`comment_id`, `position`, `prompt`, `answer`, `skipped`, `matched`)
SELECT `comment_id`, `position`, `prompt`, `answer`, `skipped`, `matched` FROM `comment_response_items_backup`;
--> statement-breakpoint
INSERT INTO `post_pins` (`post_id`, `comment_id`, `pinned_by_user_id`, `created_at`)
SELECT `post_id`, `comment_id`, `pinned_by_user_id`, `created_at` FROM `post_pins_backup`;
--> statement-breakpoint
DROP TABLE `reading_questions_backup`;
--> statement-breakpoint
DROP TABLE `fill_expected_answers_backup`;
--> statement-breakpoint
DROP TABLE `comments_backup`;
--> statement-breakpoint
DROP TABLE `comment_response_items_backup`;
--> statement-breakpoint
DROP TABLE `post_pins_backup`;
--> statement-breakpoint
-- One row per lesson share post. Examples and questions keep a JSON snapshot; a dialogue (null snapshot) is read from the
-- lesson's published document. The lesson link is cleared when the lesson is deleted, and the snapshot and titles remain.
CREATE TABLE `post_lesson_shares` (
  `post_id` text PRIMARY KEY NOT NULL,
  `group_id` text NOT NULL,
  `author_id` text NOT NULL,
  `kind` text NOT NULL,
  `course_id` text NOT NULL,
  `lesson_id` text,
  `block_id` text NOT NULL,
  `item_index` integer,
  `share_key` text NOT NULL,
  `snapshot` text,
  `course_title` text NOT NULL,
  `lesson_title` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`lesson_id`) REFERENCES `course_lessons`(`id`) ON UPDATE no action ON DELETE set null,
  CONSTRAINT `post_lesson_shares_kind_check` CHECK (`kind` in ('example', 'dialogue', 'question')),
  CONSTRAINT `post_lesson_shares_item_check` CHECK ((`kind` = 'question') = (`item_index` IS NOT NULL)),
  CONSTRAINT `post_lesson_shares_snapshot_check` CHECK ((`kind` = 'dialogue') = (`snapshot` IS NULL) AND (`snapshot` IS NULL OR json_valid(`snapshot`)))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `post_lesson_shares_author_key_unique` ON `post_lesson_shares` (`author_id`,`share_key`);
--> statement-breakpoint
CREATE INDEX `post_lesson_shares_author_lesson_idx` ON `post_lesson_shares` (`author_id`,`lesson_id`);
--> statement-breakpoint
CREATE INDEX `post_lesson_shares_lesson_idx` ON `post_lesson_shares` (`lesson_id`);
--> statement-breakpoint
PRAGMA defer_foreign_keys = off;
