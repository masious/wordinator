DROP TRIGGER IF EXISTS `users_quick_reaction_defaults`;--> statement-breakpoint
CREATE TRIGGER `users_quick_reaction_defaults`
AFTER INSERT ON `users`
WHEN NEW.`quick_reaction_one` = '' OR NEW.`quick_reaction_two` = '' OR NEW.`quick_reaction_three` = ''
BEGIN
  UPDATE `users`
  SET `quick_reaction_one` = CASE WHEN NEW.`quick_reaction_one` = '' THEN char(128077) ELSE NEW.`quick_reaction_one` END,
      `quick_reaction_two` = CASE WHEN NEW.`quick_reaction_two` = '' THEN char(10084, 65039) ELSE NEW.`quick_reaction_two` END,
      `quick_reaction_three` = CASE WHEN NEW.`quick_reaction_three` = '' THEN char(128514) ELSE NEW.`quick_reaction_three` END
  WHERE `id` = NEW.`id`;
END;
