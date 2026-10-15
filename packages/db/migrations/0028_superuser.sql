-- Superuser flag (C14e, docs/settings-and-administration.md#superuser). Every account starts false; only the operator
-- command `pnpm superuser --local|--remote --grant|--revoke <email>` changes it (docs/operations.md#superuser-command).
ALTER TABLE `users` ADD `is_superuser` integer DEFAULT 0 NOT NULL;
