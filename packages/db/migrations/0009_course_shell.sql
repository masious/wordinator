CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`level` text,
	`intended_learner` text,
	`cover_key` text,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "courses_status_check" CHECK(`status` in ('draft', 'published', 'archived'))
);
--> statement-breakpoint
CREATE INDEX `courses_group_library_idx` ON `courses` (`group_id`,`created_at`,`id`);
