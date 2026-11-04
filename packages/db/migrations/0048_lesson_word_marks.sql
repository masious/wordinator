-- Where each lesson's new words are used in its text (`lessonWordMarksSchema`, JSON). Written by the content importer only; NULL when a lesson has none.
ALTER TABLE `course_lessons` ADD `word_marks` text;
