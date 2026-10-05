CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_user_id` text NOT NULL,
	`name` text NOT NULL,
	`language` text NOT NULL,
	`invitation_token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`creator_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `groups_invitation_token_unique` ON `groups` (`invitation_token`);--> statement-breakpoint
CREATE INDEX `groups_creator_idx` ON `groups` (`creator_user_id`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`failures` integer NOT NULL,
	`window_started_at` integer NOT NULL,
	`blocked_until` integer
);
--> statement-breakpoint
CREATE INDEX `login_attempts_blocked_until_idx` ON `login_attempts` (`blocked_until`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`state` text NOT NULL,
	`requested_at` integer NOT NULL,
	`decided_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_group_user_unique` ON `memberships` (`group_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `memberships_group_state_idx` ON `memberships` (`group_id`,`state`);--> statement-breakpoint
CREATE INDEX `memberships_user_state_idx` ON `memberships` (`user_id`,`state`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`normalized_email` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`must_change_password` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_normalized_email_unique` ON `users` (`normalized_email`);