# Architecture

## Runtime topology

Wordinator uses one browser origin with two independently deployed Cloudflare Workers:

```text
Browser
  ├─ /api/*  → apps/api (Hono Worker)
  └─ /*       → apps/web (Workers Static Assets + SPA fallback)
                     │
API Worker ──────────┼─ D1 relational database
                     └─ R2 public image bucket
```

The more specific Cloudflare `/api/*` route must reach the API Worker. All other paths reach the web Worker, whose static-assets configuration falls back to `index.html` for TanStack Router routes. Local Vite development proxies `/api` to the local Worker so browser behavior remains same-origin.

## Workspace

Use a pnpm workspace with independently buildable/deployable apps:

- `apps/web`: Vite React SPA, PWA manifest/fallback, route components, client state, CSS Modules
- `apps/api`: Hono routes, authentication, authorization, D1/R2 bindings, logging
- `packages/db`: Drizzle SQLite schema, relations, migrations, repositories/query helpers
- `packages/contracts`: Zod request/response schemas, error shapes, shared domain enums
- `packages/config`: shared TypeScript and test configuration only when duplication justifies it

The web app's only rich-text dependency is BlockNote, used solely for [course lesson editing](courses.md#lesson-documents); `@blocknote/xl-multi-column` is GPL-3.0, which is acceptable because the application is private and not distributed. Dependencies flow inward: apps may depend on packages; shared packages must not depend on apps. Database implementation types do not leak into client contracts.

## Web application

- React and TypeScript strict mode
- Mantine for accessible primitives and theme integration
- CSS Modules and CSS custom properties for product styling
- TanStack Router with file-based, generated, type-safe routes and code splitting
- TanStack Query for remote data, infinite queries, mutations, invalidation, and new-post polling
- i18next/react-i18next for every visible string; English is the only initial catalog
- Vite PWA integration for install metadata and a minimal offline fallback only

Route loaders ensure authentication and critical route data. TanStack Query owns cache lifetime, pagination, refetching, and mutations. Do not maintain parallel hand-written server caches.

The implemented product routes are `/`, `/invite/$token`, `/groups/$groupId`, `/groups/$groupId/posts/$postId`, `/groups/$groupId/members`, `/groups/$groupId/members/$userId`, `/groups/$groupId/notifications`, `/groups/$groupId/courses`, `/groups/$groupId/courses/$courseId`, `/groups/$groupId/courses/$courseId/lessons/$lessonId`, and the settings pages `/groups/$groupId/settings/account`, `/settings/group`, and `/settings/members` (`/groups/$groupId/settings` redirects to Account; the creator-only pages redirect ordinary members to Account). Every group route uses the opaque group ID. Their loaders prime TanStack Query, while protected loaders redirect signed-out or forced-password-change sessions before private content renders. The notifications route queries only when it opens, as [notifications.md](notifications.md) requires. The production-safe `/ui` route remains outside authenticated product flows.

## API application

Use Hono on the Cloudflare Workers runtime and Web-standard APIs. “Node.js” describes the toolchain; production code must use Workers-compatible APIs. Keep route modules aligned to domains: auth, groups, membership, posts, discussions, reactions, notifications, profiles, courses, and media.

API conventions:

- JSON REST under `/api`
- Shared Zod validation at request and response boundaries
- Stable opaque IDs; never place mutable names in identity routes
- Consistent error envelope with a machine code, safe message, and optional field issues
- Correct HTTP status semantics
- Cursor pagination for feed, profile posts, discussions if needed, and notifications
- Idempotent toggles or explicit desired reaction state to tolerate retries
- Authorization in the API for every operation, regardless of client guards
- Optimistic concurrency for collaboratively edited records: an update sends the integer `version` it was based on, and a stale version returns `409 VERSION_CONFLICT` without writing

Phase 1 authentication is stateless: middleware verifies and slides the signed cookie, then group middleware loads current active membership and group facts from D1 for each tenant route. The browser never supplies trusted role or membership facts.

Phase 2 profile reads and group rename reuse that group middleware. `/api/settings` owns account-wide display name, bio, and quick reactions; `/api/auth/change-password` owns credential changes; `/api/groups/:groupId/members/:userId` owns group-private current/former profile reads plus its cursor-paged post list; and `PATCH /api/groups/:groupId` is creator-only.

Phase 3 adds `GET/POST /api/groups/:groupId/posts` and `GET/PATCH/DELETE /api/groups/:groupId/posts/:postId`. Every route first proves active membership through the same group middleware, then scopes nested post IDs by both `group_id` and post ID. Authors may edit or delete their posts; the group creator may additionally delete any group post. Feed and profile queries use descending `(created_at, id)` cursors, and the feed endpoint accepts a mutually compatible `newerThan` cursor for polling. TanStack Query owns infinite older pages, mutation reconciliation, detail data, and the 30-second newer-post check; local storage owns only the versioned unsent composer draft.

Phase 4 adds a post discussion read, nested comment creation/edit/deletion, a single-pin mutation, and explicit desired-state reaction toggles for posts and comments. Every comment route proves both the group and parent post before resolving the comment ID. Structured reading/fill submissions are validated against server-owned post children, and fill expected answers never enter ordinary post or discussion payloads. TanStack Query owns discussion/reaction refreshes; local storage owns only versioned unsent writing progress and ephemeral reveal state stays in the page visit.

Phase 5 adds member-directory, leave, remove, password-regeneration, avatar, group-icon, soft-delete, restore, and public-media endpoints. The settings split adds creator-only `GET /api/groups/:groupId/memberships` and replaces the group read's pending-member list with `pendingRequestCount`. Deleted groups bypass normal group middleware only for the narrowly scoped creator restore endpoint. Sessions keep active and deleted groups separate so a deleted tenant never enters the active switcher.

Phase 6 adds on-demand group notification list/read-one/read-all endpoints and a narrowly scoped authenticated status-notification endpoint for accepted, rejected, and removed membership events. Normal notification operations use the same active-membership tenant middleware as other group data. Notification destinations keep opaque post/comment IDs after target deletion and resolve availability at read time.

The course shell phase adds `GET/POST /api/groups/:groupId/courses` (newest-first `(created_at, id)` cursor pages) and `GET/PATCH /api/groups/:groupId/courses/:courseId`, plus `POST .../visibility` (owner publish/unpublish), `POST .../archive` and `POST .../restore` (owner or group creator), and `POST/DELETE .../cover` (owner). Every route scopes the course ID by `group_id` after the group middleware. Courses the viewer may not see return the same `404` as missing ones. Changes to an archived course return `409 COURSE_ARCHIVED`. Since C4, the first publication through `POST .../visibility` also creates the course's feed post in the same D1 batch; post reads join the live course and include a `course` object that omits course details when the viewer cannot open it. `PATCH` on a course post returns `409 POST_NOT_EDITABLE`. The web routes are `/groups/$groupId/courses` and `/groups/$groupId/courses/$courseId`, and the shell navigation links to the library. Since 2026-10-08 each lesson also has its own [lesson page](courses.md#lesson-pages) at `/groups/$groupId/courses/$courseId/lessons/$lessonId`, whose loader prefetches the course read and the lesson read.

Course phase C2 changes `GET .../courses/:courseId` to return the course, the complete outline of lessons the viewer may see (IDs, titles, goals, positions, published flags, versions), and the blocks of only the first three of those lessons. Later lessons load through `GET .../lessons/:lessonId` as the reader continues, and the web caches each lesson under its own query key. Owners also use `POST .../lessons`, `PATCH/DELETE .../lessons/:lessonId`, `POST .../lessons/:lessonId/blocks`, and `PATCH/DELETE .../lessons/:lessonId/blocks/:blockId`. Lesson and block updates carry the full editable state, including the published flag, plus the base `version`; a mismatch returns `409 VERSION_CONFLICT`, and a block's kind cannot change (`400 BLOCK_KIND_IMMUTABLE`). Reordering uses `PUT .../lessons/order` and `PUT .../lessons/:lessonId/blocks/order` with the complete ordered ID list of that one parent; a list that is missing, duplicating, or adding an ID returns `409 ORDER_STALE`, and accepted lists are written in one D1 batch. Creation evaluates position and the 200-item limits inside the insert (`409 LESSON_LIMIT_REACHED` or `409 BLOCK_LIMIT_REACHED`). Each lesson and block route resolves the ID under the already-authorized course and lesson, so hidden or mismatched IDs return `404`. Unpublished content is visible only to the owner and, since C5, active contributors. The group creator may delete visible lessons and blocks as moderation but cannot edit them, and nothing in an archived course changes.

Course phase C3 adds the `practice` block kind and practice answer threads. Learner block payloads never include authors' versions or item notes: the API removes them from every course and lesson read, and only course editors receive them, as a separate `reference`, so they can edit. Practice blocks carry an `answerCount` for the concealed state. Thread endpoints live under a visible practice block: `GET .../blocks/:blockId/discussion` returns the thread, the viewer's quick reactions, and the reference (authors' versions and notes), and the web requests it only when the reader reveals the thread. `POST .../blocks/:blockId/comments` creates a top-level `practice_response` answer set, with one entry per current item (`400 ANSWER_COUNT_MISMATCH` otherwise), or a plain-text reply to a top-level answer. `PATCH` and `DELETE .../blocks/:blockId/comments/:commentId` edit (author only) and delete (author or group creator), and `PUT .../comments/:commentId/reactions` toggles a reaction. Comment IDs resolve only under their own block, so post and practice comment routes cannot reach each other's rows. Non-practice blocks return `404 PRACTICE_NOT_FOUND`, writes in archived courses return `409 COURSE_ARCHIVED`, practice threads have no pins and no stored matching, and practice-thread activity creates no notifications. `POST .../blocks/:blockId/check` (added 2026-10-08) takes `{ item, answer }` and returns `{ match, authorsVersion }` using the shared `answerMatches` helper, where `authorsVersion` is that item's author's version on a miss and `null` on a match or when the item has none (item notes are never returned); it stores nothing, resolves the block like the thread routes, and returns `404 PRACTICE_ITEM_NOT_FOUND` for an item outside the practice.

Course phase C5 adds contributors. `GET .../courses/:courseId/contributors` lists active contributors to anyone who can see the course and adds pending requests for the owner. `POST .../contributors` requests a role for the signed-in member (`400 OWNER_CANNOT_CONTRIBUTE`, `409 CONTRIBUTION_EXISTS`), `POST .../contributors/leave` withdraws a request or leaves a role, `PATCH .../contributors/:userId` lets the owner accept or reject a pending request, and `DELETE .../contributors/:userId` lets the owner remove an active contributor. Course reads carry the viewer's own `contribution` state and permission flags for contributing, requesting, leaving, and managing contributors. Active contributors pass the same routes as the owner for creating lessons and blocks and for updating lessons and blocks, but an update or creation that publishes returns `403 COURSE_PUBLISH_FORBIDDEN` and an update to published content returns `403 COURSE_CONTENT_PUBLISHED`; the version check still guards against a publish that lands between their read and their save. Reordering, deleting, course details, the cover, visibility, and contributor decisions stay owner-only. Drafts and unpublished content are visible to active contributors as well as the owner. Contributor notifications carry a course ID, and their destination is unavailable once the course is archived.

Course phase C6 adds progress. `GET .../courses/:courseId/progress` returns, to anyone who can see the course, the count of published lessons, the viewer's own finished lesson IDs, and each active member's finished count and whole percentage, ordered by name. `PUT .../lessons/:lessonId/completion` idempotently records the viewer's completion of a visible, published lesson and returns the same progress payload; it refuses archived courses (`409 COURSE_ARCHIVED`) and unpublished lessons (`409 LESSON_UNPUBLISHED`), and hidden lessons stay `404`. The web keeps progress under the course query key, so course refreshes also refresh it. The lesson player derives its steps from the lesson payload already loaded.

Course phase C6b adds [lesson positions](courses.md#lesson-positions). `PUT .../lessons/:lessonId/position` takes `{ stepKey }` (validated by `lessonPositionRequestSchema`), resolves it against the published document with the shared `flattenToSteps` and `lessonStepKey` helpers, and upserts the viewer's position, keeping the furthest passed share; it returns `{ position }` and refuses archived courses, unpublished lessons, and unknown steps (`409 LESSON_STEP_NOT_FOUND`). The progress payload adds the viewer's own `positions` in published lessons, most recent first, and each member's percentage counts the passed share of unfinished started lessons. Completion deletes the lesson's position in the same batch. The player saves each move without waiting, ignores failures, and the course page refetches progress when the player closes.

Course phase C7 replaces per-row blocks with [lesson documents](courses.md#lesson-documents) and removes every `.../lessons/:lessonId/blocks` create, update, delete, and reorder route; the C2, C3, and C5 paragraphs above describe the history only where they mention blocks. Course reads return the outline with publish state derived from the published document and the first three visible lessons in the document shape. `GET .../lessons/:lessonId` gives learners the published document with authors' versions and item notes stripped and image keys expanded to URLs; the owner and active contributors also receive the draft, `draftVersion`, practice references, and the last editor. Unpublished lessons stay `404` for learners. `PATCH .../lessons/:lessonId` edits only title and goal, without a version; contributors may do so only for unpublished lessons (`403 COURSE_CONTENT_PUBLISHED`).

- `PUT .../lessons/:lessonId/draft { document, draftVersion }` (owner and active contributors, bodies up to 300 KB) validates the document with the shared schema, requires every image to be a `course_media` key of this lesson (`400 LESSON_IMAGE_INVALID`), adds practice anchors, refuses practice IDs owned by another lesson (`409 PRACTICE_ID_TAKEN`), and increments the draft version. A stale version returns `409 VERSION_CONFLICT` with the current draft, which the editor merges.
- `POST .../lessons/:lessonId/publish { draftVersion }` (owner only, `403 COURSE_PUBLISH_FORBIDDEN` otherwise) refuses unfinished drafts with `422 LESSON_NOT_READY` and the problem list, then in one D1 batch copies the draft to the published document, replaces the lesson's `course_lesson_words` rows with `collectLessonWords` of the new document (one JSON array through `json_each`, C8), and deletes practice anchors, threads, and media rows that neither document keeps. R2 deletions follow the batch. Unpublishing and lesson deletion remove the lesson's word rows in their batches.
- `POST .../lessons/:lessonId/discard` (owner only) resets the draft to the published document with the same cleanup; an unpublished lesson returns `409 LESSON_UNPUBLISHED`. `POST .../lessons/:lessonId/unpublish` (owner only) clears the published document.
- `POST .../lessons/:lessonId/images` (owner and active contributors) runs the image pipeline under `courses/{courseId}/lessons/{lessonId}/` keys, records a `course_media` row, and returns `{ key, url, width, height }`.
- `GET .../courses/:courseId/words` (C8, anyone who can see the course) returns `{ words }` (`courseWordsResponseSchema`) for the [course word recap](courses.md#word-recap): the indexed words of currently published lessons the viewer has finished, ordered by lesson position and then word position, with repeated terms (trimmed, case-insensitive) kept at their first occurrence. It is not paginated; the response is capped at `COURSE_RECAP_WORDS_MAX`. The web keeps it under the course query key (`courseWordsQueryOptions`) and refetches it when the lesson player closes.
- Practice thread routes keep their `.../lessons/:lessonId/blocks/:blockId/...` paths, where the block ID is a practice block ID in the published document, or for the owner and active contributors also in the draft (`404 PRACTICE_NOT_FOUND` otherwise). Completions and progress count a lesson as published when its published document is not null.

The web loads the BlockNote editor only on editing surfaces as a lazy chunk; the reader and player render documents with Wordinator's own renderer.

## Database

Cloudflare D1 is the relational system of record. Drizzle provides typed schema/query access through the D1 binding. Drizzle Kit generates committed SQL migrations; Wrangler applies the same migration directory to explicit local or remote targets.

Use transactions/batches where a logical mutation spans multiple records and D1 supports the required atomic behavior. Index every frequent tenant-scoped access path beginning with `group_id` where appropriate.

Migration `0005_phase_three_posts.sql` adds `posts`, `reading_questions`, and `fill_expected_answers`, including feed/profile indexes and cascading structured-child cleanup. Migration `0006_phase_four_discussions.sql` adds comments, structured response items, post pins, and polymorphic reactions with tenant/target indexes and uniqueness for one user/target/emoji. Post and comment deletion is hard deletion and explicitly cleans reaction targets that relational cascades cannot represent.

## Images

The API validates type and size and coordinates image metadata. R2 stores static PNG/JPEG/WebP objects under unguessable `avatars/`, `groups/`, and `courses/` keys. Objects are publicly readable by URL by product decision. Client-side cropping (square for avatars and icons, 2:1 at 1200×600 for course covers) improves UX; server-side validation remains authoritative. Lesson images live under `courses/{courseId}/lessons/{lessonId}/`, are re-encoded in the browser (any aspect ratio, longest edge 1600 px, under 1 MB), and are tracked in `course_media`; see [lesson images](courses.md#images). `MEDIA` is the R2 binding and `PUBLIC_MEDIA_BASE_URL` is the public URL prefix returned in contracts.

The API Worker also exports a `scheduled` handler. A daily cron trigger (`triggers.crons` in `apps/api/wrangler.jsonc`) runs `sweepLessonMedia`, which deletes `course_media` rows older than 24 hours that neither lesson document references and then their R2 objects.

## PWA behavior

The product is installable but online-only. Cache only the minimum static offline fallback needed to show an intentional internet-required page on a cold offline launch. Do not cache API responses for offline use and do not queue mutations. New service-worker versions should avoid silently discarding local-storage drafts.

## Environments and delivery

There are two targets: local development and one production installation. A root workspace command runs web and API concurrently. Each app retains independent development, test, build, and Wrangler deployment commands. Deployment is manual; there is no CI/CD initially.
