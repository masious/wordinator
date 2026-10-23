-- Story comprehension is retired as a lesson activity (docs/lesson-activities.md#activity-catalogue). Its shared activities are deleted,
-- which cascades to their runs and answers. `lesson_activities` keeps its type check, because rebuilding it would cascade-delete
-- every learner's runs. It was never a guided grammar follow-up, so no other payload names it.
DELETE FROM `lesson_activities` WHERE `activity_type` = 'story_comprehension';
