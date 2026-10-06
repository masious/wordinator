-- Phase C7b: one draft and one published lesson document per lesson replace per-row course blocks.
-- The block mapping below matches `upgradeLegacyBlocks` in @wordinator/contracts/lesson-document; the migration test keeps
-- them in step. Practice threads keep a real foreign key through course_practices, which takes over the practice block IDs.
-- Dropping a parent table fires ON DELETE CASCADE on its children, so comments and their children are copied into
-- constraint-free backup tables and restored after the rebuild, as in 0011. course_lessons is altered in place, never
-- rebuilt, because completions, practices, and media cascade from it.
PRAGMA defer_foreign_keys = on;
--> statement-breakpoint
ALTER TABLE `course_lessons` ADD `draft_doc` text DEFAULT '{"schemaVersion":2,"blocks":[]}' NOT NULL CHECK (json_valid(`draft_doc`));
--> statement-breakpoint
ALTER TABLE `course_lessons` ADD `draft_version` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `course_lessons` ADD `published_doc` text CHECK (`published_doc` IS NULL OR json_valid(`published_doc`));
--> statement-breakpoint
ALTER TABLE `course_lessons` ADD `published_at` integer;
--> statement-breakpoint
-- One JSON block per legacy row. Strings taken out of JSON are concatenated with '' so they stay plain text, never JSON.
CREATE TABLE `lesson_document_blocks` AS
SELECT b.`lesson_id`, b.`position`, b.`created_at`, b.`id`, b.`published`,
  CASE b.`kind`
    WHEN 'heading' THEN json_object(
      'id', b.`id`, 'type', 'heading',
      'props', json_object('textColor', 'default', 'backgroundColor', 'default', 'textAlignment', 'left', 'level', 2, 'isToggleable', json('false')),
      'content', CASE WHEN json_extract(b.`payload`, '$.title') = '' THEN json_array()
        ELSE json_array(json_object('type', 'text', 'text', '' || json_extract(b.`payload`, '$.title'), 'styles', json_object())) END,
      'children', json_array())
    WHEN 'text' THEN json_object(
      'id', b.`id`, 'type', 'paragraph',
      'props', json_object('textColor', 'default', 'backgroundColor', 'default', 'textAlignment', 'left'),
      'content', CASE WHEN json_extract(b.`payload`, '$.content') = '' THEN json_array()
        ELSE json_array(json_object('type', 'text', 'text', '' || json_extract(b.`payload`, '$.content'), 'styles', json_object())) END,
      'children', json_array())
    WHEN 'example' THEN json_object(
      'id', b.`id`, 'type', 'example',
      'props', json_object('translation', COALESCE(json_extract(b.`payload`, '$.translation'), ''), 'note', COALESCE(json_extract(b.`payload`, '$.note'), '')),
      'content', CASE WHEN json_extract(b.`payload`, '$.sentence') = '' THEN json_array()
        ELSE json_array(json_object('type', 'text', 'text', '' || json_extract(b.`payload`, '$.sentence'), 'styles', json_object())) END,
      'children', json_array())
    WHEN 'dialogue' THEN json_object(
      'id', b.`id`, 'type', 'dialogue', 'props', json_object('turns', '' || json_extract(b.`payload`, '$.turns')), 'children', json_array())
    WHEN 'practice' THEN json_object(
      'id', b.`id`, 'type', 'practice', 'props', json_object('data', '' || b.`payload`), 'children', json_array())
  END AS `block`
FROM `course_blocks` b;
--> statement-breakpoint
UPDATE `course_lessons` SET `draft_doc` = json_object('schemaVersion', 2, 'blocks', (
  SELECT json_group_array(json(ordered.`block`)) FROM (
    SELECT d.`block` FROM `lesson_document_blocks` d WHERE d.`lesson_id` = `course_lessons`.`id` ORDER BY d.`position`, d.`created_at`, d.`id`
  ) ordered
));
--> statement-breakpoint
UPDATE `course_lessons` SET `published_at` = `updated_at`, `published_doc` = json_object('schemaVersion', 2, 'blocks', (
  SELECT json_group_array(json(ordered.`block`)) FROM (
    SELECT d.`block` FROM `lesson_document_blocks` d WHERE d.`lesson_id` = `course_lessons`.`id` AND d.`published` = 1 ORDER BY d.`position`, d.`created_at`, d.`id`
  ) ordered
)) WHERE `published` = 1;
--> statement-breakpoint
DROP TABLE `lesson_document_blocks`;
--> statement-breakpoint
-- One anchor row per practice block ID, in either document, so answer threads keep a foreign key.
CREATE TABLE `course_practices` (
  `id` text PRIMARY KEY NOT NULL,
  `group_id` text NOT NULL,
  `course_id` text NOT NULL,
  `lesson_id` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`lesson_id`) REFERENCES `course_lessons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `course_practices_lesson_idx` ON `course_practices` (`group_id`, `lesson_id`);
--> statement-breakpoint
INSERT INTO `course_practices` (`id`, `group_id`, `course_id`, `lesson_id`, `created_at`)
SELECT `id`, `group_id`, `course_id`, `lesson_id`, `created_at` FROM `course_blocks` WHERE `kind` = 'practice';
--> statement-breakpoint
-- Every uploaded lesson image, so the API accepts only keys uploaded to the lesson and cleans up unreferenced ones.
CREATE TABLE `course_media` (
  `key` text PRIMARY KEY NOT NULL,
  `group_id` text NOT NULL,
  `course_id` text NOT NULL,
  `lesson_id` text NOT NULL,
  `created_by` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`lesson_id`) REFERENCES `course_lessons`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `course_media_lesson_idx` ON `course_media` (`group_id`, `lesson_id`, `created_at`);
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
	FOREIGN KEY (`block_id`) REFERENCES `course_practices`(`id`) ON DELETE cascade,
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
SELECT `id`, `group_id`, `post_id`, `block_id`, `author_id`, `parent_comment_id`, `kind`, `body`, `created_at`, `updated_at` FROM `comments_backup`;
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
DROP TABLE `course_blocks`;
--> statement-breakpoint
ALTER TABLE `course_lessons` DROP COLUMN `published`;
--> statement-breakpoint
ALTER TABLE `course_lessons` DROP COLUMN `version`;
--> statement-breakpoint
PRAGMA defer_foreign_keys = off;
