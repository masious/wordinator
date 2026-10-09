-- Lesson speech (C10a): content-addressed clips, one pending job per lesson, the course dialogue cast, and word IPA overrides.
-- `speech_clips` holds no lesson, course, or group ID and no text: a clip is shared by every lesson that speaks the same text
-- in the same voice, and inserting its row is the claim that keeps Azure from being called twice for it. Clips and their R2
-- objects (`speech/{hash}.mp3`) are kept when lessons change. `speech_jobs` rows cascade from their course and lesson.
-- No backfill here: the release queues a job for every published lesson (docs/operations.md).
ALTER TABLE `courses` ADD `speech_cast` text CHECK (`speech_cast` IS NULL OR json_valid(`speech_cast`));
--> statement-breakpoint
ALTER TABLE `course_lesson_words` ADD `ipa` text;
--> statement-breakpoint
CREATE TABLE `speech_clips` (
  `hash` text PRIMARY KEY NOT NULL,
  `voice` text NOT NULL,
  `characters` integer NOT NULL,
  `status` text NOT NULL,
  `attempts` integer DEFAULT 0 NOT NULL,
  `next_attempt_at` integer,
  `claimed_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  CONSTRAINT "speech_clips_status_check" CHECK(`status` in ('pending', 'ready', 'failed'))
);
--> statement-breakpoint
CREATE TABLE `speech_jobs` (
  `lesson_id` text PRIMARY KEY NOT NULL,
  `group_id` text NOT NULL,
  `course_id` text NOT NULL,
  `due_at` integer NOT NULL,
  `attempts` integer DEFAULT 0 NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`lesson_id`) REFERENCES `course_lessons`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `speech_jobs_due_idx` ON `speech_jobs` (`due_at`);
