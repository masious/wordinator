CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`recipient_user_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`kind` text NOT NULL,
	`post_id` text,
	`comment_id` text,
	`created_at` integer NOT NULL,
	`read_at` integer,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`recipient_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "notifications_kind_check" CHECK(`kind` in ('join_requested', 'join_accepted', 'join_rejected', 'member_removed', 'post_response', 'reply', 'answer_pinned', 'reaction'))
);
--> statement-breakpoint
CREATE INDEX `notifications_recipient_group_created_idx` ON `notifications` (`recipient_user_id`,`group_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `notifications_recipient_created_idx` ON `notifications` (`recipient_user_id`,`created_at`);
