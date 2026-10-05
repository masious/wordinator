CREATE TABLE `platform_metadata` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `platform_metadata` (`key`, `value`, `updated_at`)
VALUES ('schema_version', '0', unixepoch() * 1000);

