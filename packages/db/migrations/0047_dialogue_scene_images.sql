-- Illustration assets for staged lesson dialogues. The slot uniqueness makes generation and retries idempotent.
CREATE TABLE `dialogue_scene_images` (
  `id` text PRIMARY KEY NOT NULL,
  `group_id` text NOT NULL REFERENCES `groups`(`id`),
  `course_id` text NOT NULL REFERENCES `courses`(`id`) ON DELETE cascade,
  `lesson_id` text NOT NULL REFERENCES `course_lessons`(`id`) ON DELETE cascade,
  `block_id` text NOT NULL,
  `kind` text NOT NULL,
  `speaker` text,
  `line_index` integer,
  `key` text NOT NULL UNIQUE,
  `width` integer NOT NULL,
  `height` integer NOT NULL,
  `created_by` text NOT NULL REFERENCES `users`(`id`),
  `created_at` integer NOT NULL,
  CONSTRAINT `dialogue_scene_images_kind_check` CHECK (`kind` IN ('location','scene','mask','portrait')),
  CONSTRAINT `dialogue_scene_images_slot_check` CHECK (
    (`kind` = 'location' AND `speaker` IS NULL AND `line_index` IS NULL) OR
    (`kind` = 'scene' AND `speaker` IS NULL) OR
    (`kind` = 'mask' AND `speaker` IS NULL AND `line_index` IS NOT NULL) OR
    (`kind` = 'portrait' AND `speaker` IS NOT NULL AND `line_index` IS NULL)
  ),
  CONSTRAINT `dialogue_scene_images_dimensions_check` CHECK (`width` > 0 AND `height` > 0),
  CONSTRAINT `dialogue_scene_images_line_check` CHECK (`line_index` IS NULL OR `line_index` >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dialogue_scene_images_slot_unique` ON `dialogue_scene_images` (`lesson_id`,`block_id`,`kind`,coalesce(`speaker`,''),coalesce(`line_index`,-1));
--> statement-breakpoint
CREATE INDEX `dialogue_scene_images_lesson_idx` ON `dialogue_scene_images` (`group_id`,`lesson_id`,`block_id`);
