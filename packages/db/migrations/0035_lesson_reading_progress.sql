-- Lesson share (docs/courses.md#progress, docs/data-model.md#course_lesson_positions): reading steps reached of the lesson's
-- reading steps (every step but practice questions), for the reading half of a lesson's progress. NULL on rows saved before
-- this change, which fall back to the passed share of all steps until the next save.
ALTER TABLE `course_lesson_positions` ADD `reading_reached` integer;
ALTER TABLE `course_lesson_positions` ADD `reading_total` integer;
