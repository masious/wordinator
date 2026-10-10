-- Word search (New words panel): normalized search keys on the course word index, written on publish with `wordSearchKey`
-- from the contracts (case, diacritics, ß, and whitespace folded). `term_key` ranks and orders matches; `search_key` holds the
-- term, forms, and meaning keys separated by newlines and is matched as a substring. SQLite cannot fold diacritics, so existing
-- rows start with NULL keys and the search endpoint fills them in the Worker before it searches. No index serves the search itself:
-- substring matches (`LIKE '%…%'`) cannot use one, and the table is bounded by the library's published lessons.
ALTER TABLE `course_lesson_words` ADD `term_key` text;
--> statement-breakpoint
ALTER TABLE `course_lesson_words` ADD `search_key` text;
--> statement-breakpoint
-- Finds the rows still waiting for their keys without scanning the index.
CREATE INDEX `course_lesson_words_unkeyed_idx` ON `course_lesson_words` (`lesson_id`) WHERE `term_key` IS NULL OR `search_key` IS NULL;
