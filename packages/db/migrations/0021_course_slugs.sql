-- Readable URL slugs for courses and lessons, assigned once from the title (see docs/courses.md#readable-urls).
-- Existing rows are backfilled with the same folding as slugify in the contracts where SQLite allows: accents fold,
-- punctuation becomes dashes, and a title that leaves any other character falls back to a short ID-based slug.
-- Repeated titles keep the plain slug on the oldest row and get a short ID suffix on the others.
-- Non-ASCII characters are written as char() calls because the Workers test pool passes migrations in a Latin-1 header.
ALTER TABLE `courses` ADD `slug` text;
--> statement-breakpoint
ALTER TABLE `course_lessons` ADD `slug` text;
--> statement-breakpoint
CREATE TABLE `_slug_stage` (`id` text PRIMARY KEY NOT NULL, `scope` text NOT NULL, `created_at` integer NOT NULL, `base` text NOT NULL, `rest` text NOT NULL);
--> statement-breakpoint
INSERT INTO `_slug_stage` (`id`, `scope`, `created_at`, `base`, `rest`) SELECT `id`, `group_id`, `created_at`, lower(`title`), '' FROM `courses`;
--> statement-breakpoint
UPDATE `_slug_stage` SET `base` = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(`base`, char(224), 'a'), char(225), 'a'), char(226), 'a'), char(228), 'a'), char(227), 'a'), char(229), 'a'), char(192), 'a'), char(193), 'a'), char(194), 'a'), char(196), 'a');
--> statement-breakpoint
UPDATE `_slug_stage` SET `base` = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(`base`, char(195), 'a'), char(197), 'a'), char(232), 'e'), char(233), 'e'), char(234), 'e'), char(235), 'e'), char(200), 'e'), char(201), 'e'), char(202), 'e'), char(203), 'e');
--> statement-breakpoint
UPDATE `_slug_stage` SET `base` = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(`base`, char(236), 'i'), char(237), 'i'), char(238), 'i'), char(239), 'i'), char(204), 'i'), char(205), 'i'), char(206), 'i'), char(207), 'i'), char(242), 'o'), char(243), 'o');
--> statement-breakpoint
UPDATE `_slug_stage` SET `base` = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(`base`, char(244), 'o'), char(246), 'o'), char(245), 'o'), char(248), 'o'), char(210), 'o'), char(211), 'o'), char(212), 'o'), char(214), 'o'), char(213), 'o'), char(216), 'o');
--> statement-breakpoint
UPDATE `_slug_stage` SET `base` = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(`base`, char(249), 'u'), char(250), 'u'), char(251), 'u'), char(252), 'u'), char(217), 'u'), char(218), 'u'), char(219), 'u'), char(220), 'u'), char(231), 'c'), char(199), 'c');
--> statement-breakpoint
UPDATE `_slug_stage` SET `base` = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(`base`, char(241), 'n'), char(209), 'n'), char(255), 'y'), char(223), 'ss'), char(230), 'ae'), char(198), 'ae'), char(339), 'oe'), char(338), 'oe'), ' ', '-'), char(9), '-');
--> statement-breakpoint
UPDATE `_slug_stage` SET `base` = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(`base`, char(10), '-'), char(13), '-'), char(8212), '-'), char(8211), '-'), ':', '-'), ';', '-'), ',', '-'), '.', '-'), '?', '-'), '!', '-');
--> statement-breakpoint
UPDATE `_slug_stage` SET `base` = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(`base`, '"', '-'), '''', '-'), char(8217), '-'), char(8216), '-'), char(8220), '-'), char(8221), '-'), '(', '-'), ')', '-'), '[', '-'), ']', '-');
--> statement-breakpoint
UPDATE `_slug_stage` SET `base` = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(`base`, '/', '-'), '\', '-'), '&', '-'), '+', '-'), '*', '-'), '#', '-'), '@', '-'), '%', '-'), '=', '-'), '_', '-');
--> statement-breakpoint
UPDATE `_slug_stage` SET `base` = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(`base`, '|', '-'), '~', '-'), '`', '-'), '^', '-'), '<', '-'), '>', '-'), '{', '-'), '}', '-'), char(8230), '-'), '$', '-');
--> statement-breakpoint
UPDATE `_slug_stage` SET `base` = replace(`base`, char(8364), '-');
--> statement-breakpoint
UPDATE `_slug_stage` SET `base` = replace(replace(replace(replace(replace(replace(`base`, '--', '-'), '--', '-'), '--', '-'), '--', '-'), '--', '-'), '--', '-');
--> statement-breakpoint
UPDATE `_slug_stage` SET `base` = trim(substr(trim(`base`, '-'), 1, 60), '-');
--> statement-breakpoint
UPDATE `_slug_stage` SET `rest` = `base`;
--> statement-breakpoint
UPDATE `_slug_stage` SET `rest` = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(`rest`, 'a', ''), 'b', ''), 'c', ''), 'd', ''), 'e', ''), 'f', ''), 'g', ''), 'h', ''), 'i', ''), 'j', '');
--> statement-breakpoint
UPDATE `_slug_stage` SET `rest` = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(`rest`, 'k', ''), 'l', ''), 'm', ''), 'n', ''), 'o', ''), 'p', ''), 'q', ''), 'r', ''), 's', ''), 't', '');
--> statement-breakpoint
UPDATE `_slug_stage` SET `rest` = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(`rest`, 'u', ''), 'v', ''), 'w', ''), 'x', ''), 'y', ''), 'z', ''), '0', ''), '1', ''), '2', ''), '3', '');
--> statement-breakpoint
UPDATE `_slug_stage` SET `rest` = replace(replace(replace(replace(replace(replace(replace(`rest`, '4', ''), '5', ''), '6', ''), '7', ''), '8', ''), '9', ''), '-', '');
--> statement-breakpoint
UPDATE `_slug_stage` SET `base` = 'course-' || substr(replace(`id`, '-', ''), 1, 8) WHERE `base` = '' OR `rest` <> '';
--> statement-breakpoint
UPDATE `courses` SET `slug` = (
  SELECT CASE WHEN `ranked`.`rn` = 1 THEN `ranked`.`base` ELSE rtrim(substr(`ranked`.`base`, 1, 53), '-') || '-' || substr(replace(`ranked`.`id`, '-', ''), 1, 6) END
  FROM (SELECT `id`, `base`, row_number() OVER (PARTITION BY `scope`, `base` ORDER BY `created_at`, `id`) AS `rn` FROM `_slug_stage`) AS `ranked`
  WHERE `ranked`.`id` = `courses`.`id`
);
--> statement-breakpoint
DELETE FROM `_slug_stage`;
--> statement-breakpoint
INSERT INTO `_slug_stage` (`id`, `scope`, `created_at`, `base`, `rest`) SELECT `id`, `course_id`, `created_at`, lower(`title`), '' FROM `course_lessons`;
--> statement-breakpoint
UPDATE `_slug_stage` SET `base` = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(`base`, char(224), 'a'), char(225), 'a'), char(226), 'a'), char(228), 'a'), char(227), 'a'), char(229), 'a'), char(192), 'a'), char(193), 'a'), char(194), 'a'), char(196), 'a');
--> statement-breakpoint
UPDATE `_slug_stage` SET `base` = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(`base`, char(195), 'a'), char(197), 'a'), char(232), 'e'), char(233), 'e'), char(234), 'e'), char(235), 'e'), char(200), 'e'), char(201), 'e'), char(202), 'e'), char(203), 'e');
--> statement-breakpoint
UPDATE `_slug_stage` SET `base` = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(`base`, char(236), 'i'), char(237), 'i'), char(238), 'i'), char(239), 'i'), char(204), 'i'), char(205), 'i'), char(206), 'i'), char(207), 'i'), char(242), 'o'), char(243), 'o');
--> statement-breakpoint
UPDATE `_slug_stage` SET `base` = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(`base`, char(244), 'o'), char(246), 'o'), char(245), 'o'), char(248), 'o'), char(210), 'o'), char(211), 'o'), char(212), 'o'), char(214), 'o'), char(213), 'o'), char(216), 'o');
--> statement-breakpoint
UPDATE `_slug_stage` SET `base` = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(`base`, char(249), 'u'), char(250), 'u'), char(251), 'u'), char(252), 'u'), char(217), 'u'), char(218), 'u'), char(219), 'u'), char(220), 'u'), char(231), 'c'), char(199), 'c');
--> statement-breakpoint
UPDATE `_slug_stage` SET `base` = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(`base`, char(241), 'n'), char(209), 'n'), char(255), 'y'), char(223), 'ss'), char(230), 'ae'), char(198), 'ae'), char(339), 'oe'), char(338), 'oe'), ' ', '-'), char(9), '-');
--> statement-breakpoint
UPDATE `_slug_stage` SET `base` = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(`base`, char(10), '-'), char(13), '-'), char(8212), '-'), char(8211), '-'), ':', '-'), ';', '-'), ',', '-'), '.', '-'), '?', '-'), '!', '-');
--> statement-breakpoint
UPDATE `_slug_stage` SET `base` = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(`base`, '"', '-'), '''', '-'), char(8217), '-'), char(8216), '-'), char(8220), '-'), char(8221), '-'), '(', '-'), ')', '-'), '[', '-'), ']', '-');
--> statement-breakpoint
UPDATE `_slug_stage` SET `base` = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(`base`, '/', '-'), '\', '-'), '&', '-'), '+', '-'), '*', '-'), '#', '-'), '@', '-'), '%', '-'), '=', '-'), '_', '-');
--> statement-breakpoint
UPDATE `_slug_stage` SET `base` = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(`base`, '|', '-'), '~', '-'), '`', '-'), '^', '-'), '<', '-'), '>', '-'), '{', '-'), '}', '-'), char(8230), '-'), '$', '-');
--> statement-breakpoint
UPDATE `_slug_stage` SET `base` = replace(`base`, char(8364), '-');
--> statement-breakpoint
UPDATE `_slug_stage` SET `base` = replace(replace(replace(replace(replace(replace(`base`, '--', '-'), '--', '-'), '--', '-'), '--', '-'), '--', '-'), '--', '-');
--> statement-breakpoint
UPDATE `_slug_stage` SET `base` = trim(substr(trim(`base`, '-'), 1, 60), '-');
--> statement-breakpoint
UPDATE `_slug_stage` SET `rest` = `base`;
--> statement-breakpoint
UPDATE `_slug_stage` SET `rest` = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(`rest`, 'a', ''), 'b', ''), 'c', ''), 'd', ''), 'e', ''), 'f', ''), 'g', ''), 'h', ''), 'i', ''), 'j', '');
--> statement-breakpoint
UPDATE `_slug_stage` SET `rest` = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(`rest`, 'k', ''), 'l', ''), 'm', ''), 'n', ''), 'o', ''), 'p', ''), 'q', ''), 'r', ''), 's', ''), 't', '');
--> statement-breakpoint
UPDATE `_slug_stage` SET `rest` = replace(replace(replace(replace(replace(replace(replace(replace(replace(replace(`rest`, 'u', ''), 'v', ''), 'w', ''), 'x', ''), 'y', ''), 'z', ''), '0', ''), '1', ''), '2', ''), '3', '');
--> statement-breakpoint
UPDATE `_slug_stage` SET `rest` = replace(replace(replace(replace(replace(replace(replace(`rest`, '4', ''), '5', ''), '6', ''), '7', ''), '8', ''), '9', ''), '-', '');
--> statement-breakpoint
UPDATE `_slug_stage` SET `base` = 'lesson-' || substr(replace(`id`, '-', ''), 1, 8) WHERE `base` = '' OR `rest` <> '';
--> statement-breakpoint
UPDATE `course_lessons` SET `slug` = (
  SELECT CASE WHEN `ranked`.`rn` = 1 THEN `ranked`.`base` ELSE rtrim(substr(`ranked`.`base`, 1, 53), '-') || '-' || substr(replace(`ranked`.`id`, '-', ''), 1, 6) END
  FROM (SELECT `id`, `base`, row_number() OVER (PARTITION BY `scope`, `base` ORDER BY `created_at`, `id`) AS `rn` FROM `_slug_stage`) AS `ranked`
  WHERE `ranked`.`id` = `course_lessons`.`id`
);
--> statement-breakpoint
DELETE FROM `_slug_stage`;
--> statement-breakpoint
DROP TABLE `_slug_stage`;
--> statement-breakpoint
CREATE UNIQUE INDEX `courses_group_slug_unique` ON `courses` (`group_id`, `slug`);
--> statement-breakpoint
CREATE UNIQUE INDEX `course_lessons_course_slug_unique` ON `course_lessons` (`course_id`, `slug`);
