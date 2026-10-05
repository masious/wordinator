CREATE TABLE `comments` (
  `id` text PRIMARY KEY NOT NULL,
  `group_id` text NOT NULL,
  `post_id` text NOT NULL,
  `author_id` text NOT NULL,
  `parent_comment_id` text,
  `kind` text NOT NULL,
  `body` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`),
  FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON DELETE cascade,
  FOREIGN KEY (`author_id`) REFERENCES `users`(`id`),
  FOREIGN KEY (`parent_comment_id`) REFERENCES `comments`(`id`) ON DELETE cascade,
  CONSTRAINT `comments_kind_check` CHECK (`kind` in ('text', 'reading_response', 'fill_response'))
);
--> statement-breakpoint
CREATE INDEX `comments_group_post_parent_idx` ON `comments` (`group_id`,`post_id`,`parent_comment_id`,`created_at`,`id`);
--> statement-breakpoint
CREATE TABLE `comment_response_items` (
  `comment_id` text NOT NULL,
  `position` integer NOT NULL,
  `prompt` text,
  `answer` text NOT NULL,
  `skipped` integer NOT NULL,
  `matched` integer,
  FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `comment_response_items_comment_position_unique` ON `comment_response_items` (`comment_id`,`position`);
--> statement-breakpoint
CREATE TABLE `post_pins` (
  `post_id` text PRIMARY KEY NOT NULL,
  `comment_id` text NOT NULL,
  `pinned_by_user_id` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON DELETE cascade,
  FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON DELETE cascade,
  FOREIGN KEY (`pinned_by_user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `post_pins_comment_unique` ON `post_pins` (`comment_id`);
--> statement-breakpoint
CREATE TABLE `reactions` (
  `group_id` text NOT NULL,
  `user_id` text NOT NULL,
  `target_kind` text NOT NULL,
  `target_id` text NOT NULL,
  `emoji` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`),
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`),
  CONSTRAINT `reactions_target_kind_check` CHECK (`target_kind` in ('post', 'comment'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reactions_actor_target_emoji_unique` ON `reactions` (`user_id`,`target_kind`,`target_id`,`emoji`);
--> statement-breakpoint
CREATE INDEX `reactions_group_target_idx` ON `reactions` (`group_id`,`target_kind`,`target_id`);
