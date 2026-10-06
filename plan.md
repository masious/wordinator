# Courses delivery plan

This plan is for agents implementing the courses feature. The product blueprint is [docs/courses.md](docs/courses.md). It owns every course rule; this file owns only sequencing and the documentation changes each phase must make.

The existing docs deliberately do **not** mention courses yet. Do not update them ahead of the phase that ships the affected behavior. Each phase below lists its documentation edits; a phase is not complete until those edits, its code, migrations, and tests are all done, per [AGENTS.md](AGENTS.md).

## Ground rules

- Read [docs/courses.md](docs/courses.md) and [docs/index.md](docs/index.md) before starting any phase.
- If implementation forces a rule change, update `docs/courses.md` first, then this plan.
- Course content tables carry an explicit `group_id`. Every course, lesson, block, and answer route needs negative tenant tests and nested-ID tests (another group's course, lesson, or block ID under a valid group ID).
- Shared Zod contracts own every payload, limit, and the per-kind block schemas. Do not define block shapes inside either app.
- Speaking, text-to-speech, update feed posts, and progress tracking are out of scope for every phase in this plan.

## Phase C0 — Adopt the blueprint (docs only)

Make the blueprint official without describing unshipped behavior as shipped.

| Doc | Change |
| --- | --- |
| `docs/index.md` | Add `courses.md`, owning "Course structure, blocks, contributors, publishing, practice threads, and loading". |
| `docs/what_is_it.md` | In non-goals, replace "Lessons, a fixed curriculum, …" with "Platform-provided lessons or a fixed curriculum, …" and keep translation, dictionaries, grammar correction, pronunciation, and AI generation. Add one sentence under the core loop saying members may also build shared, member-authored courses (link `courses.md`). Reword "It is not a … professional course" to "It is not a … professional course provider". |
| `docs/roadmap.md` | Add a `## Course phases` section (anchor `course-phases`) before the backlog, listing C1–C5 from this plan as not started. Add the deferred items from `courses.md` to the backlog. |
| `docs/product-requirements.md` | Under required capabilities, add "Member-authored group courses (see roadmap course phases)". |

**Exit:** the index, overview, roadmap, and requirements reference the blueprint; no other doc changes.

## Phase C1 — Course shell

Build: `courses` table and migration; create, edit, archive, and restore; owner-only editing; draft/published status; cover image under `courses/` reusing the R2 pipeline with a wide crop; library route `/groups/$groupId/courses` and course route `/groups/$groupId/courses/$courseId`; navigation entry for the library.

| Doc | Change |
| --- | --- |
| `docs/data-model.md` | Add a `## Courses` section with `courses` (opaque ID, group ID, owner ID, title, summary, level, intended learner, cover key, status, timestamps). Add archive semantics to "Deletion and retention" and the library index `(group_id, created_at, id)` to "Indexing and isolation". |
| `docs/architecture.md` | Add a course phase paragraph listing the new routes and endpoints, the `courses/` R2 key prefix in "Images", and `courses` to the API domain list. |
| `docs/user-flows.md` | Add "Create and publish a course" covering the shell only. |
| `docs/design-system.md` | Record any new library/course layout or cover treatment tokens. |
| `docs/testing.md` | Add course nested-ID and owner-permission cases to the API integration list. |
| `docs/roadmap.md` | Mark C1 complete with a dated summary. |

## Phase C2 — Lessons and content blocks

Build: `course_lessons` and `course_blocks` tables; lesson and block create/edit/delete; `heading`, `text`, `example`, and `dialogue` kinds; per-parent reorder; lesson and block published flags; integer versions with conflict responses; course read returning the outline plus the first three visible lessons; lesson read by ID; local unsaved block drafts with draft kind `course-block`.

| Doc | Change |
| --- | --- |
| `docs/data-model.md` | Add `course_lessons` and `course_blocks` (kind, JSON payload, payload version, version, published, updated-by). Note hard deletion of lessons and blocks. |
| `docs/architecture.md` | Document paged course loading, version-conflict status semantics, and the reorder contract. Add conflict handling to API conventions. |
| `docs/posts-and-feed.md` | In "Composer and drafts", list `course-block` as an additional draft kind and link `courses.md`. |
| `docs/testing.md` | Add unit tests for block payload schemas and versioned payload parsing, and component tests for the block editor and conflict message. |
| `docs/user-flows.md` | Extend the course flow with adding lessons and blocks over several sessions. |
| `docs/roadmap.md` | Mark C2 complete. |

**Acceptance fixture:** normalize `course-example-part-iii.json` and `lesson-13.json` into a fixture under the test fixtures directory: drop sections in favor of `heading` blocks, convert `_____` to `…`, store author's versions as per-blank lists, flatten the reading follow-up into its own practice block, and drop speaking placeholders, `grammar`, `topicVocabulary`, `connectsFrom`, `preparesFor`, `references`, and `futureReferences`. Content-only blocks are used here; practice blocks join in C3. Delete the two root JSON files once the fixture exists.

## Phase C3 — Practice blocks and answer threads

Build: `practice` kind; learner payloads without authors' versions or notes; comments generalized to target either a post or a practice block (SQLite table rebuild migration, check constraint requiring exactly one target); new comment kind `practice_response` reusing `comment_response_items` with prompt snapshots; concealed threads; replies and reactions; author's version and notes delivered only with the revealed thread; no matching and no pinning.

| Doc | Change |
| --- | --- |
| `docs/discussions-and-reactions.md` | Add a `## Course practice threads` section (anchor `course-practice-threads`): concealment identical to posts, ordered answer sets, no pins, no matching, author's version revealed with the thread. Note that the comments target is now a post or a practice block. |
| `docs/data-model.md` | Update `comments` (exactly one of post ID or block ID), the new kind, and cascade rules from block deletion to comments, response items, and reactions. |
| `docs/architecture.md` | Add practice discussion endpoints and the rule that learner block payloads never include authors' versions. |
| `docs/security-and-privacy.md` | Note that concealment of authors' versions is spoiler protection, not authorization, consistent with post answers. |
| `docs/testing.md` | Add tests that learner payloads omit authors' versions, prompt snapshots survive edits, and block deletion cascades. Add a Playwright path answering a practice and revealing the thread. |
| `docs/user-flows.md` | Add "Practise a lesson". |
| `docs/roadmap.md` | Mark C3 complete. |

## Phase C4 — Feed presence

Build: post type `course` with a nullable course link, created once on first course publication; feed card linking to the course; visible comments and reactions; unavailable state for archived courses; composer never offers the type.

| Doc | Change |
| --- | --- |
| `docs/posts-and-feed.md` | Add the course post type under "Post types": system-created, not composer-editable, visible comments, no pinning. |
| `docs/product-requirements.md` | Change "four post types" to "five post types" and note one is system-created. |
| `docs/data-model.md` | Add the `posts` course link and the `course` type to the type constraint. |
| `docs/what_is_it.md` | Update the post-type sentence in the core loop. |
| `docs/roadmap.md` | Mark C4 complete. |

## Phase C5 — Contributors

Build: `course_contributors` table mirroring membership states; request, accept, reject, leave, and remove; contributors edit only unpublished lessons and blocks; owner-only publish/unpublish; updated-by attribution in the editor; owner-facing pending request list; notifications for contributor requests and decisions.

| Doc | Change |
| --- | --- |
| `docs/groups-and-membership.md` | Under "Roles", add that courses have per-course owner and contributor roles that add no group roles, and that the creator keeps moderation over course content. Link `courses.md`. |
| `docs/notifications.md` | Add contributor request, acceptance, and rejection triggers. |
| `docs/data-model.md` | Add `course_contributors` and the new notification kinds. |
| `docs/testing.md` | Add negative permission tests: contributor editing published content, contributor publishing, non-contributor editing, and former contributors. |
| `docs/user-flows.md` | Add "Contribute to a course". |
| `docs/roadmap.md` | Mark C5 complete and record the course feature as delivered. |

## Later, not planned

Feed posts for course updates from an activity log, speaking practice (requires a product exception and privacy review), text-to-speech, role-play dialogues, images inside blocks, and progress tracking. Add a phase to this plan only after the product decision is recorded in `docs/courses.md`.
