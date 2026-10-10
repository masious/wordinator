# Operations

Use Node.js 20.19 or newer and pnpm 10.15.0 or newer. Use pnpm and Wrangler. Never default a data-changing command to production.

## Environments

- **Local:** local Workers runtime, local D1, and a local R2-compatible binding/emulation where supported
- **Production:** one Cloudflare account/zone with web Worker, API Worker, D1 database, public R2 bucket, routes, and secrets

There is no staging environment initially.

## Workspace commands

Run these commands from the repository root:

- `pnpm install` — install the pinned workspace dependency graph
- `pnpm dev` — run the web app on `http://localhost:5173` and API Worker on `http://localhost:8787`; Vite proxies `/api` to the Worker
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`
- `pnpm build`
- `pnpm --filter @wordinator/web deploy` and `pnpm --filter @wordinator/api deploy` — deploy one app after production resource IDs and routes are configured
- `pnpm db:generate` — generate a reviewed Drizzle migration after a schema change
- `pnpm db:migrate:local` — apply committed migrations to local D1
- `pnpm db:migrate:remote` — apply committed migrations to production D1 explicitly
- `pnpm bootstrap --local` or `pnpm bootstrap --remote` — create the first account and the single course-library record against one explicit target
- `pnpm set-password --local <email>` or `pnpm set-password --remote <email>` — replace an existing account password against one explicit target

Do not implement an ambiguous `deploy` or `migrate` command that silently chooses production.

The Playwright harness uses the installed stable Chrome channel and Playwright WebKit. Before the first run, install WebKit with `pnpm --filter @wordinator/web exec playwright install webkit`. The configured critical harness runs both engines.
Its D1 fixture is isolated under `.wrangler/e2e`; running `pnpm test:e2e` does not reset the ordinary local development database.

## Local setup

1. Run `pnpm install`.
2. Copy `apps/api/.dev.vars.example` to the ignored `apps/api/.dev.vars` and replace the placeholder with a strong local cookie-signing secret. For [lesson speech](speech.md), also set `AZURE_SPEECH_KEY` there; without it the speech worker does nothing. `AZURE_SPEECH_REGION` is a plain variable in `wrangler.jsonc`. `wrangler dev` does not fire cron triggers on its own: start it with `--test-scheduled` and request `/__scheduled?cron=*+*+*+*+*` to run the speech worker once.
3. Run `pnpm db:migrate:local` to create and migrate a fresh local D1 database.
4. Run `pnpm bootstrap --local` and enter the first account and library language.
5. Run `pnpm dev`.
6. Open `http://localhost:5173` and sign in with the bootstrap account.

The checked-in all-zero D1 `database_id` is a local-development placeholder. Replace it with the provisioned production D1 ID before deployment; do not commit secrets to Wrangler configuration or `.dev.vars`.

## Resource setup

Production needs:

1. A D1 database bound to the API Worker.
2. An R2 bucket configured for public object reads and bound to the API Worker.
3. A strong cookie-signing secret stored with Wrangler secret management.
4. An Azure AI Speech resource (currently in `germanywestcentral`), whose key is the `AZURE_SPEECH_KEY` Worker secret (`pnpm --filter @wordinator/api exec wrangler secret put AZURE_SPEECH_KEY`) and whose region is the `AZURE_SPEECH_REGION` variable in `apps/api/wrangler.jsonc`. Rotate the key in the Azure portal and put the new one; never commit it.
5. An API Worker route for `/api/*` on the application hostname.
6. A web Worker using Workers Static Assets with SPA fallback for all other routes.

Keep IDs and non-secret binding names in Wrangler configuration. Keep secrets out of committed files.

The API binds the image bucket as `MEDIA`. Set `PUBLIC_MEDIA_BASE_URL` to the deployed API `/api/media` prefix or the bucket’s public custom domain. The checked-in localhost value is only for local development. Public access is intentional: possession of an image URL bypasses application membership.

## Migrations

Drizzle owns schema definitions and generates SQL into the migration directory referenced by the API Worker’s Wrangler configuration. Review and commit generated SQL.

Required workflow:

1. Generate a migration from an intentional schema change.
2. Review SQL and associated data transformations.
3. Apply to a fresh local D1 database.
4. Run integration tests.
5. Test upgrade from the previous schema when relevant.
6. Back up production.
7. Apply with an explicit remote target.
8. Deploy compatible API/web versions.

Never edit production schema ad hoc without immediately capturing and reconciling a migration.

### Speech backfill

Migration `0019_speech.sql` adds the speech tables empty. After it is applied and the API with the speech worker is deployed, queue a due job for every published lesson, including lessons seeded directly into the database, and watch the per-minute `speech.run` log lines drain them (about 40 clips a minute):

```sh
pnpm --filter @wordinator/api exec wrangler d1 execute wordinator --remote --command "INSERT INTO speech_jobs (lesson_id, group_id, course_id, due_at, attempts, created_at, updated_at) SELECT id, group_id, course_id, 0, 0, unixepoch() * 1000, unixepoch() * 1000 FROM course_lessons WHERE published_doc IS NOT NULL ON CONFLICT (lesson_id) DO UPDATE SET due_at = 0"
pnpm --filter @wordinator/api exec wrangler d1 execute wordinator --remote --command "SELECT COUNT(*) AS jobs FROM speech_jobs"
```

Use `--local` instead of `--remote` for the local database. The same statement re-queues every lesson if clips ever need regenerating, for example after the speech schema version changes. Word IPA reaches `course_lesson_words` only when a lesson is next published, so the term clips of words with an IPA override in a published lesson come from the published document either way.

## Bootstrap CLI

The interactive bootstrap tool requires exactly one of `--local` or `--remote`. It prompts for:

- First user email, password, and username (3–30 letters, numbers, or underscores)
- Library language: Dutch or German, used for lesson speech

It validates that bootstrap has not already created equivalent records, hashes the password, creates the already-onboarded user plus the single library record and its legacy membership row atomically where possible, and never echoes the password after input.

Run it from the workspace root as `pnpm bootstrap --local` or `pnpm bootstrap --remote`. Supplying both targets, neither target, or any extra argument fails before database access. The tool checks that the target has no user records, writes the three records in one Wrangler invocation, removes its mode-`0600` temporary SQL file, and confirms that open registration is available. Open registration (`POST /api/auth/register`) fails with `LIBRARY_NOT_READY` until bootstrap has created the library record. Wrangler's local D1 executor does not accept explicit transaction statements; if any bootstrap statement fails, the tool makes a scoped cleanup pass using the newly generated user and group IDs.

## Operator password setting

Run `pnpm set-password --local <email>` or `pnpm set-password --remote <email>` from the workspace root. The target and email are required; the new password is requested through a hidden interactive prompt so it is not stored in shell history. The tool looks up the normalized email, rejects unknown accounts and passwords shorter than six characters, writes a fresh PBKDF2 hash through a mode-`0600` temporary SQL file, clears `must_change_password`, and removes the temporary file after the D1 command finishes. Existing stateless sessions remain valid, as described in [authentication.md](authentication.md).

## Manual deployment

Before the first deployment, replace the all-zero `database_id` in `apps/api/wrangler.jsonc`, confirm `wordinator-media` is the real bucket name, set `PUBLIC_MEDIA_BASE_URL` to the production `/api/media` origin or public bucket domain, and configure the API `/api/*` and web hostname routes in the two Wrangler files. Record the actual account ID, D1 database ID/name, R2 bucket, hostnames, and configuration commit in the private operator record; do not put credentials in that record or repository.

Run the following from the repository root, stopping on any failure:

```sh
pnpm --filter @wordinator/api exec wrangler whoami
pnpm --filter @wordinator/api exec wrangler d1 info wordinator --remote
pnpm --filter @wordinator/api exec wrangler r2 bucket info wordinator-media
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

Then:

1. Complete the backup procedure below before any destructive migration.
2. Run `pnpm db:migrate:remote`; the command contains an explicit `--remote` flag.
3. Run `pnpm --filter @wordinator/api deploy`, then `pnpm --filter @wordinator/web deploy`.
4. Run `pnpm bootstrap --remote` only for a clean installation. Never run bootstrap against an installation containing users.
5. In current desktop Chrome, desktop Safari, Chrome on Android, and Safari on iOS, record date/version/pass-fail for sign-in, group switch, composer, notification destination, discussion reply, and mobile navigation.
6. Verify the offline fallback says the internet is required and that reconnect/retry preserves a local draft.
7. Confirm the API Worker shows its two cron triggers, daily and every minute (`wrangler deploy` prints them; the dashboard lists them under Triggers). The daily `lesson_media.swept` log line records how many unreferenced lesson images were removed; each minute's `speech.run` line records the jobs taken and clips synthesized or failed, a `speech.samples` line appears when voice samples were generated; and `speech.throttled`, `speech.unauthorized`, or `speech.synthesis_failed` lines need attention when they repeat.
8. Run the friend-group smoke test with two accounts: invitation, approval, post, concealed answer, reaction, reply, notification/read state, image delivery, leave/removal status, and sign-out/sign-in.

The deploy scripts above invoke `wrangler deploy` from the appropriate app directory. Before the first production deploy, replace the placeholder D1 ID, provision the resources described above, and configure the two hostname routes. Production provisioning and route IDs are intentionally not invented in source control.

## Backup

Schedule a maintenance window: a D1 export blocks database requests while it runs. Choose an encrypted backup location outside the production Cloudflare account/resources and set a timestamp and deployed version explicitly:

```sh
BACKUP_UTC=2026-10-03T120000Z
APP_VERSION=phase6-2026-10-03
BACKUP_DIR=/absolute/encrypted/backups/wordinator-${BACKUP_UTC}-${APP_VERSION}
mkdir -p "$BACKUP_DIR/r2"
pnpm --filter @wordinator/api exec wrangler d1 export wordinator --remote --output "$BACKUP_DIR/d1.sql"
pnpm --filter @wordinator/api exec wrangler d1 info wordinator --remote > "$BACKUP_DIR/d1-info.txt"
pnpm --filter @wordinator/api exec wrangler r2 bucket info wordinator-media > "$BACKUP_DIR/r2-info.txt"
```

Wrangler 4.38 can get/put individual R2 objects but does not list or synchronize a whole bucket. Configure `rclone` with a private Cloudflare R2 S3 remote named `wordinator-production-r2` (account-specific endpoint and least-privilege credentials), then copy every key and verify it:

```sh
rclone copy wordinator-production-r2:wordinator-media "$BACKUP_DIR/r2" --metadata --checksum --create-empty-src-dirs
rclone check wordinator-production-r2:wordinator-media "$BACKUP_DIR/r2" --download
find "$BACKUP_DIR" -type f ! -name SHA256SUMS -exec shasum -a 256 {} \; > "$BACKUP_DIR/SHA256SUMS"
```

Record the D1 export size, R2 object/byte counts from `rclone size`, checksum result, UTC completion time, operator, and application/schema version. Encrypt the directory at rest and restrict access: D1 contains emails, password hashes, bios, and private authored text. Cloudflare Time Travel may complement but does not replace this operator-owned export.

## Restore drill

Never test a restore over production. Provision an empty D1 database and R2 bucket in the same account (for example `wordinator-restore-drill` and `wordinator-media-restore-drill`), and record their real IDs. Import the saved SQL into the empty database and copy the exact R2 keys:

```sh
pnpm --filter @wordinator/api exec wrangler d1 execute wordinator-restore-drill --remote --file /absolute/encrypted/backups/wordinator-UTC-VERSION/d1.sql
rclone copy /absolute/encrypted/backups/wordinator-UTC-VERSION/r2 wordinator-production-r2:wordinator-media-restore-drill --metadata --checksum --create-empty-src-dirs
rclone check /absolute/encrypted/backups/wordinator-UTC-VERSION/r2 wordinator-production-r2:wordinator-media-restore-drill --download
```

Deploy temporary API/web drill configuration bound only to those restore resources; never reuse the production hostname or cookie secret. Run pending migrations only if the restored schema version requires them. Verify sign-in, active/pending/former memberships, all post types, discussions, notification read/deleted-target state, public images, and a soft-deleted group followed by restore. Record the UTC date, backup identifier, resource IDs, verification results, and cleanup decision. Treat the drill as failed until D1 and R2 checks plus application smoke tests all pass.

Automated backup and CI/CD are future work.

## Logging and incidents

Use structured Worker logs for request ID, route, status, timing, safe error code, and opaque actor/group IDs when useful. Exclude credentials, cookies, invitation tokens, temporary passwords, and authored bodies. For this initial project, operational recovery may use direct Cloudflare/D1 access because there is no global admin UI.
