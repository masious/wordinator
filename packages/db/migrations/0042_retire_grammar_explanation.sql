-- Grammar explanation is retired as a lesson activity (docs/lesson-activities.md#activity-catalogue). Its shared activities are deleted,
-- which cascades to their runs and answers. `lesson_activities` keeps its type check, because rebuilding it would cascade-delete
-- every learner's runs. Guided grammar payloads drop it from their suggested follow-ups, so they keep parsing.
DELETE FROM `lesson_activities` WHERE `activity_type` = 'grammar_explanation';
--> statement-breakpoint
UPDATE `lesson_activities` SET `payload` = json_set(`payload`, '$.followUps', json((
  SELECT json_group_array(`entry`.`value`) FROM json_each(`lesson_activities`.`payload`, '$.followUps') AS `entry`
  WHERE `entry`.`value` <> 'grammar_explanation'
))) WHERE `activity_type` = 'guided_grammar' AND json_valid(`payload`) AND json_type(`payload`, '$.followUps') = 'array';
