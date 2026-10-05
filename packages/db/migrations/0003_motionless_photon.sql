ALTER TABLE `memberships` ADD `profile_display_name` text;--> statement-breakpoint
ALTER TABLE `memberships` ADD `profile_bio` text;--> statement-breakpoint
ALTER TABLE `memberships` ADD `profile_avatar_key` text;--> statement-breakpoint
ALTER TABLE `users` ADD `bio` text;--> statement-breakpoint
ALTER TABLE `users` ADD `avatar_key` text;--> statement-breakpoint
ALTER TABLE `users` ADD `quick_reaction_one` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `quick_reaction_two` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `quick_reaction_three` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `users`
SET `quick_reaction_one` = char(128077),
    `quick_reaction_two` = char(10084, 65039),
    `quick_reaction_three` = char(128514);--> statement-breakpoint
UPDATE `memberships`
SET `profile_display_name` = (SELECT `display_name` FROM `users` WHERE `users`.`id` = `memberships`.`user_id`),
    `profile_bio` = (SELECT `bio` FROM `users` WHERE `users`.`id` = `memberships`.`user_id`),
    `profile_avatar_key` = (SELECT `avatar_key` FROM `users` WHERE `users`.`id` = `memberships`.`user_id`)
WHERE `state` IN ('active', 'left', 'removed');
