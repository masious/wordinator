# Settings and administration

This document owns the Settings page, the Tutor settings section, the superuser role with its analytics page and AI settings, and the interactive image cropper. Field rules stay with their owners: account fields in [profiles-and-settings.md](profiles-and-settings.md), credentials in [authentication.md](authentication.md), and tutor behavior in [ai-tutor.md](ai-tutor.md).

Settings is one account-wide page at `/settings` for every signed-in account that has completed setup. It has no sub-navigation. The Tutor section and the superuser pages are planned (C14); everything else has shipped.

## Current Settings page

`/settings` holds the account controls owned by [profiles and settings](profiles-and-settings.md) (an identity header with the avatar editor, then the profile form with display name, bio, and quick reactions, and a side rail with [Notices](notifications.md), Appearance, the per-device [speech recognizer](words.md#recognizers), and the password change) and, since C14, a [Tutor](#tutor-settings) section. Notices is kept here instead of in the primary navigation because it is an on-demand supporting view. For a superuser Settings also links to [Analytics](#analytics) and to [AI providers and models](#ai-providers-and-models).

### Tutor settings

C14 (approved product change, 2026-10-15). A Tutor section on `/settings` edits the [tutor profile](ai-tutor.md#tutor-profile): native language (a select, English by default), reply language (my language, the library language, or mixed), and goals (optional plain text, at most 500 characters). Below them it shows the tutor's own notes about the learner, read-only, with Clear notes (confirmed). C14l turns the notes into a list of dated entries, each with Delete and an optional follow-up date, beside Clear all ([tutor notes](tutor-sessions-and-memory.md#tutor-notes)), and adds **Default context**: the sections and sizes of the tutor's starting context and an optional focus course, used by new conversations ([context scope](tutor-sessions-and-memory.md#context-scope)). The section says plainly that tutor conversations are processed by external AI providers that may keep them (see [security and privacy](security-and-privacy.md#ai-tutor)). It saves with its own button through `PUT /api/ai/profile`.

**Study goal** (C15, approved product change 2026-10-20) sits above the tutor fields in its own block: a number input for the [daily goal](learning-time.md#daily-goal-and-streak) in minutes (5–240) with a clear option for no goal, read through `GET /api/learning/goal` and saved with its own button through `PUT /api/learning/goal`. It stays visible when the tutor profile fails to load.

## Superuser

C14 (approved product change, 2026-10-15). A superuser is an account with `users.is_superuser` set. It is granted and revoked only by the operator command `pnpm superuser --local|--remote --grant|--revoke <email>` ([operations](operations.md#superuser-command)); no route changes it. A superuser has no power over other accounts or content; the flag opens only the analytics page and the AI providers and models page. The session read carries `isSuperuser` so the web can show the link; every superuser route checks the flag in the API and answers `403 SUPERUSER_REQUIRED` otherwise.

The [library creator's](groups-and-membership.md#library-creator) leftover moderation powers stay separate technical debt; the superuser does not replace them.

### Analytics

`/admin/analytics`, linked from Settings for superusers only, shows the installation's activity for a chosen range (last 7 days by default, or 30 or 90 days), by UTC day:

- **Learning:** active accounts (any review, attempt, position, completion, or tutor turn that day), lessons completed, drill reviews, practice attempts (lesson, tutor, and AI practice), and pronunciation attempts.
- **AI:** tutor turns, model requests, tokens in and out, and cost, per account and per provider and model, with failed requests counted separately.
- **Speech:** on-demand speech requests and characters per account, split into cache hits and Azure calls.
- **Time** (C15): minutes of [learning time](learning-time.md#analytics) per day and per account, by category (`GET /api/admin/analytics/time`).

Accounts are listed by username. The page shows counts and costs only, never message text, answers, words, or scores. It is a desktop page with tables, and its reads are `GET /api/admin/analytics/{learning|ai|speech}?days=7|30|90` (7 when missing; any other value is `400 VALIDATION_ERROR`), validated and shaped by `@wordinator/contracts/admin`.

As built (C14e): each section has a table by day (newest first, every day of the range shown, with a totals row) and a table of per-account totals over the range; AI adds a table per provider and model. Activity counts come from `word_reviews` (drill reviews are `source = drill`; seed reviews are not activity), `practice_attempts` by source, `pronunciation_attempts`, `course_lesson_completions`, saved `course_lesson_positions`, and `ai_usage` turn starts. AI requests include fallback attempts, and tokens and cost cover every request, failed or not. Speech splits requests and characters into cache hits and Azure calls (with the characters sent to Azure). The range picker keeps its choice in the URL (`?days=30`). Other accounts opening `/admin/analytics` see a not-available state and no analytics request is made.

### AI settings

The [AI providers and models page](#ai-providers-and-models) holds the AI settings form, stored in [`platform_metadata`](data-model.md#platform_metadata) under `ai_settings`:

- **Provider order:** Azure, OpenRouter, and Workers AI by default ([default models](ai-tutor.md#providers-and-fallback)), reorderable, each with an on/off switch; at least one must be on. The order is the Default for conversations; a learner can put another enabled provider first for one conversation ([per-conversation model](ai-tutor.md#providers-and-fallback)).
- **Model per provider:** a model ID per target. Only tool-calling models may be used; the form says so and the API checks the ID's format, not the model's abilities.
- **Daily turn cap** per account (default 40, 0–500) and **daily speech character cap** per account (default 5,000, 0–100,000).

`GET` and `PUT /api/admin/ai-settings` read and replace the whole value, validated by the contracts' `aiSettingsSchema` (`400 AI_SETTINGS_INVALID` with the issues; a body that is not JSON is `400 INVALID_JSON`). `PUT` answers with the saved value. Changes apply to the next turn. The form checks the same rules before saving (at least one provider on, a valid model ID per provider, whole-number caps in range) and moves providers with up and down buttons.

### AI providers and models

`/admin/ai` is the superuser's page for the providers and models the tutor calls. It is linked from Settings and from the analytics page, for superusers only. Other accounts see a not-available state and the page makes no request. It holds the [AI settings](#ai-settings) form (order, enabled switch, and model per provider, and the two caps), and each provider row also shows:

- **Credentials.** `Credentials set` or `Credentials missing`, from `GET /api/admin/ai-providers`. The status is presence only: `OPENROUTER_API_KEY`, the `AI` binding, or both `AZURE_AI_ENDPOINT` and `AZURE_AI_KEY`. For Azure the response also carries the endpoint's host, and nothing else of the endpoint. No secret, path, or query is ever returned.
- **Test connection.** `POST /api/admin/ai-providers/test` with `{ provider, model }`, where the model is the row's current value, including an edit not yet saved. The page refuses an ID outside the format without a request. The API sends one request to that provider only, through the tutor's provider code with no fallback: the fixed prompt `Reply with OK.`, at most 5 output tokens, and a 20-second limit. It answers `{ ok, status, latencyMs, message }`. `status` is the HTTP status, or `null` when no answer came (network, timeout, or a binding error). On success `message` is the start of the reply, at most 40 characters. On failure it is the provider's own error message from its JSON body, with anything that looks like a key or bearer token replaced by `[redacted]`, cut to 300 characters; without a message it says what happened. A row with no credentials gets `ok: false` and no request is sent.
- **Not metered.** A test writes no [`ai_usage`](data-model.md#ai_usage) row, counts toward no daily turn or speech cap, and changes no saved setting; saving stays the only change, through `PUT /api/admin/ai-settings`. The API logs `ai.provider_test` with provider, model, status, ok, and latency only.
- **Refusals.** Both routes answer `401 AUTH_REQUIRED` and `403 SUPERUSER_REQUIRED` like the other `/api/admin` routes. The test route answers `400 INVALID_JSON` for a body that is not JSON and `400 VALIDATION_ERROR` for a provider outside the list or a model ID outside the format.

Shapes are `aiProvidersResponseSchema`, `aiProviderTestRequestSchema`, and `aiProviderTestResponseSchema` in `@wordinator/contracts/ai`.

## Image cropper

Picking an avatar or course cover opens a cropper, so people choose what part of a photo is kept (before 2026-10-06 the browser centre-cropped every upload).

- The account avatar opens the cropper from the shared `AvatarEditor` ([profiles and settings](profiles-and-settings.md#avatar-editor)), and the course cover from the shared `ImageUpload` component. The avatar uses a fixed square frame and the cover its fixed 2:1 frame. (The retired group icon also used the square frame.) The frame mask matches how the image is displayed.
- It opens in the shared adaptive dialog: centered on desktop, full screen on mobile.
- Drag (mouse, touch, or pen) moves the image. A labeled zoom slider, the mouse wheel, and pinch zoom between 1× and 3×. The image always covers the frame, with no empty edges.
- Keyboard: arrow keys move the image and `+`/`-` zoom, with every control reachable by Tab. Reset returns to the centered fit.
- Save renders the chosen area from the original pixels to the current output (512×512 JPEG for square, 1200×600 for wide) and uploads it through the existing endpoint. Re-encoding still strips metadata, and photo orientation follows the file's EXIF orientation.
- The dialog's help text carries the public-by-URL notice (`notice` prop); upload surfaces do not repeat it on the page.
- Cancel discards the selection and leaves the current image unchanged. An upload error keeps the dialog open with the selection intact, so the person can retry.
- No API, size-limit, type-check, or R2 cleanup change. The server checks stay as they are.

The cropper uses `react-easy-crop`, styled with its static stylesheet (automatic style injection is disabled) followed by CSS Modules and design tokens.

## Retired group administration

The settings split (shipped 2026-10-06, see the [roadmap](roadmap.md#settings-split)) divided Settings into Account, Group, and Members pages, with group rename, icon, deletion, and a creator-only membership administration page (pending requests, active members with remove and temporary passwords, rejected and former members). Groups were retired with the [global library](groups-and-membership.md) on 2026-10-10:

- Every `/groups/$groupId/settings/...` route redirects to `/settings`, and `/settings` shows only the account page. The deleted-groups list and its Restore action are no longer shown.
- The API still answers the compatibility endpoints `GET /api/groups/:groupId/memberships`, `PATCH`, `DELETE`, and `POST .../regenerate-password` on `/memberships/:userId`, `POST /memberships/leave`, and the group rename, icon, delete, and restore routes. No screen calls them, and they are removed with the rest of the compatibility layer. The [library creator](groups-and-membership.md#library-creator) is the only account that passes their creator checks.
- The earlier rules for these pages are in git history before the global-library change.

## Verification

- Workers integration: the profile and password routes as owned by [profiles and settings](profiles-and-settings.md); and for C14, `403 SUPERUSER_REQUIRED` on every `/api/admin/...` route for ordinary accounts, `aiSettingsSchema` validation, analytics returning counts only, and the tutor profile read and update scoped to the signed-in account.
- React Testing Library: `/settings` renders the profile, Notices link, appearance, recognizer, and password controls with no sub-navigation; the Tutor section saves and clears notes; the Analytics link shows only for a superuser.
- API: `admin-ai-providers.test.ts`, the superuser flag on both provider routes (`401` and `403`), presence-only credentials with no secret in the body, the test through stubbed fetch and binding (a `200` reply, an OpenRouter `404` message surfaced with the key redacted, a network failure, a missing credential), the `400` refusals, and no `ai_usage` row.
- React Testing Library: `/admin/ai` shows a not-available state to other accounts with no request; the credentials badges; the test button's success and failure lines (status, latency, and message, inline and `aria-live`), tests of an unsaved model, and the refusal of an invalid ID without a request; saving still sends the whole value. The Settings and analytics links to the page show for the superuser only.
- Unit: the crop-area to output-pixel calculation for both frames, including zoom limits and the cover-the-frame clamp.
- React Testing Library: choosing a file opens the cropper; Cancel uploads nothing; Save uploads one file of the expected size; keyboard moving and zooming work; an upload error keeps the dialog open.
- Playwright: Settings at `/settings` saves the profile and uploads an avatar through the cropper (`settings-split.spec.ts`), and a legacy `/groups/.../settings` link redirects to `/settings`.

## Out of scope

Ownership transfer, bans, account administration by the superuser, bulk actions, and any account setting not listed above. The cropper adds no rotation, filters, free aspect ratio, or image editing beyond move and zoom.
