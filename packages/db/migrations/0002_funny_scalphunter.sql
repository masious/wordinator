CREATE TABLE `__memberships_backup` AS
SELECT `group_id`, `user_id`, `state`, `requested_at`, `decided_at`, `updated_at` FROM `memberships`;
--> statement-breakpoint
DROP TABLE `memberships`;
--> statement-breakpoint
CREATE TABLE `__new_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_user_id` text NOT NULL,
	`name` text NOT NULL,
	`language` text NOT NULL,
	`invitation_token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`creator_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "groups_language_check" CHECK("__new_groups"."language" in ('nl', 'de'))
);
--> statement-breakpoint
INSERT INTO `__new_groups`("id", "creator_user_id", "name", "language", "invitation_token", "created_at", "updated_at", "deleted_at")
SELECT "id", "creator_user_id", "name", "language", "invitation_token", "created_at", "updated_at", "deleted_at" FROM `groups`;
--> statement-breakpoint
DROP TABLE `groups`;
--> statement-breakpoint
ALTER TABLE `__new_groups` RENAME TO `groups`;
--> statement-breakpoint
CREATE UNIQUE INDEX `groups_invitation_token_unique` ON `groups` (`invitation_token`);
--> statement-breakpoint
CREATE INDEX `groups_creator_idx` ON `groups` (`creator_user_id`);
--> statement-breakpoint
CREATE TABLE `memberships` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	`state` text NOT NULL,
	`requested_at` integer NOT NULL,
	`decided_at` integer,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "memberships_state_check" CHECK("memberships"."state" in ('pending', 'active', 'rejected', 'left', 'removed'))
);
--> statement-breakpoint
INSERT INTO `memberships`("group_id", "user_id", "state", "requested_at", "decided_at", "updated_at")
SELECT "group_id", "user_id", "state", "requested_at", "decided_at", "updated_at" FROM `__memberships_backup`;
--> statement-breakpoint
DROP TABLE `__memberships_backup`;
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_group_user_unique` ON `memberships` (`group_id`,`user_id`);
--> statement-breakpoint
CREATE INDEX `memberships_group_state_idx` ON `memberships` (`group_id`,`state`);
--> statement-breakpoint
CREATE INDEX `memberships_user_state_idx` ON `memberships` (`user_id`,`state`);
