-- Phase C4: system-created course posts in the feed.
-- SQLite cannot change a CHECK constraint in place, so posts is rebuilt with the nullable course link and the `course` type.
-- Dropping posts fires ON DELETE CASCADE on its children, so they are copied into constraint-free backup tables and restored
-- after the rename, as in 0011.
PRAGMA defer_foreign_keys = on;
--> statement-breakpoint
ALTER TABLE `courses` ADD `first_published_at` integer;
--> statement-breakpoint
-- Courses already published before C4 count as announced; they do not receive a retroactive feed post.
UPDATE `courses` SET `first_published_at` = `updated_at` WHERE `status` = 'published';
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
  CONSTRAINT `posts_type_check` CHECK (`type` in ('shared_sentence', 'question', 'reading', 'fill_in', 'course')),
  CONSTRAINT `posts_course_link_check` CHECK ((`type` = 'course') = (`course_id` IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `posts_new` (`id`, `group_id`, `author_id`, `type`, `body`, `notes`, `course_id`, `created_at`, `updated_at`)
SELECT `id`, `group_id`, `author_id`, `type`, `body`, `notes`, NULL, `created_at`, `updated_at` FROM `posts`;
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
PRAGMA defer_foreign_keys = off;
