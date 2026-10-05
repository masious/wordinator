CREATE TABLE `posts` (
  `id` text PRIMARY KEY NOT NULL,
  `group_id` text NOT NULL,
  `author_id` text NOT NULL,
  `type` text NOT NULL,
  `body` text NOT NULL,
  `notes` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  CONSTRAINT `posts_type_check` CHECK (`type` in ('shared_sentence', 'question', 'reading', 'fill_in'))
);
--> statement-breakpoint
CREATE INDEX `posts_group_feed_idx` ON `posts` (`group_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE INDEX `posts_group_author_idx` ON `posts` (`group_id`,`author_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE TABLE `reading_questions` (
  `id` text PRIMARY KEY NOT NULL,
  `post_id` text NOT NULL,
  `position` integer NOT NULL,
  `text` text NOT NULL,
  FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reading_questions_post_position_unique` ON `reading_questions` (`post_id`,`position`);
--> statement-breakpoint
CREATE TABLE `fill_expected_answers` (
  `post_id` text NOT NULL,
  `position` integer NOT NULL,
  `text` text,
  FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fill_expected_answers_post_position_unique` ON `fill_expected_answers` (`post_id`,`position`);
