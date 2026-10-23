-- The model a lesson activity was generated with, shown on its page (docs/lesson-activities.md#shared-cached-content). Null for
-- read aloud, which no model writes, and for activities cached before this column existed.
ALTER TABLE `lesson_activities` ADD `generated_by` text;
