-- Phase C5: course contributors and contributor notifications.
-- A contributor row mirrors the membership lifecycle: one row per member and course whose state moves between
-- pending, active, rejected, left, and removed, so there is at most one pending request per member and course.
CREATE TABLE `course_contributors` (
  `group_id` text NOT NULL,
  `course_id` text NOT NULL,
  `user_id` text NOT NULL,
  `state` text NOT NULL,
  `requested_at` integer NOT NULL,
  `decided_at` integer,
  `updated_at` integer NOT NULL,
  PRIMARY KEY (`course_id`, `user_id`),
  FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  CONSTRAINT `course_contributors_state_check` CHECK (`state` in ('pending', 'active', 'rejected', 'left', 'removed'))
);
--> statement-breakpoint
CREATE INDEX `course_contributors_course_state_idx` ON `course_contributors` (`group_id`, `course_id`, `state`);
--> statement-breakpoint
-- SQLite cannot change a CHECK constraint in place, so notifications is rebuilt with the contributor kinds and a course link.
-- No table references notifications, so a plain copy is enough.
CREATE TABLE `notifications_new` (
  `id` text PRIMARY KEY NOT NULL,
  `group_id` text NOT NULL,
  `recipient_user_id` text NOT NULL,
  `actor_user_id` text NOT NULL,
  `kind` text NOT NULL,
  `post_id` text,
  `comment_id` text,
  `course_id` text,
  `created_at` integer NOT NULL,
  `read_at` integer,
  FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`recipient_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  CONSTRAINT `notifications_kind_check` CHECK (`kind` in ('join_requested', 'join_accepted', 'join_rejected', 'member_removed', 'post_response', 'reply', 'answer_pinned', 'reaction', 'contributor_requested', 'contributor_accepted', 'contributor_rejected'))
);
--> statement-breakpoint
INSERT INTO `notifications_new` (`id`, `group_id`, `recipient_user_id`, `actor_user_id`, `kind`, `post_id`, `comment_id`, `course_id`, `created_at`, `read_at`)
SELECT `id`, `group_id`, `recipient_user_id`, `actor_user_id`, `kind`, `post_id`, `comment_id`, NULL, `created_at`, `read_at` FROM `notifications`;
--> statement-breakpoint
DROP TABLE `notifications`;
--> statement-breakpoint
ALTER TABLE `notifications_new` RENAME TO `notifications`;
--> statement-breakpoint
CREATE INDEX `notifications_recipient_group_created_idx` ON `notifications` (`recipient_user_id`,`group_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `notifications_recipient_created_idx` ON `notifications` (`recipient_user_id`,`created_at`);
