CREATE TABLE `course_lessons` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`course_id` text NOT NULL,
	`title` text NOT NULL,
	`goal` text,
	`position` integer NOT NULL,
	`published` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `course_lessons_course_position_idx` ON `course_lessons` (`group_id`,`course_id`,`position`);
--> statement-breakpoint
CREATE TABLE `course_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`group_id` text NOT NULL,
	`course_id` text NOT NULL,
	`lesson_id` text NOT NULL,
	`position` integer NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`payload_version` integer NOT NULL,
	`published` integer DEFAULT false NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lesson_id`) REFERENCES `course_lessons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "course_blocks_kind_check" CHECK(`kind` in ('heading', 'text', 'example', 'dialogue')),
	CONSTRAINT "course_blocks_payload_check" CHECK(json_valid(`payload`))
);
--> statement-breakpoint
CREATE INDEX `course_blocks_lesson_position_idx` ON `course_blocks` (`group_id`,`lesson_id`,`position`);
