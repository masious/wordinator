-- Open registration and required account onboarding.
-- Existing accounts are treated as already onboarded; new accounts complete a unique username after registration.
ALTER TABLE `users` ADD `username` text;
--> statement-breakpoint
ALTER TABLE `users` ADD `onboarding_completed_at` integer;
--> statement-breakpoint
UPDATE `users`
SET `username` = 'learner_' || substr(replace(`id`, '-', ''), 1, 8),
    `onboarding_completed_at` = `created_at`;
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username` COLLATE NOCASE);
