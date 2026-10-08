# Roadmap

The initial delivery is ordered by dependency. Completion means code, tests, migrations, and affected documentation are all complete. Post-launch items are intentionally unprioritized until real use provides evidence.

## Phase 0 — Workspace and platform foundation (completed)

- Create pnpm workspace and the `apps/web`, `apps/api`, `packages/db`, and `packages/contracts` boundaries.
- Configure strict TypeScript, Vite React, Cloudflare Workers runtime, Hono, D1, Drizzle, and local `/api` proxying.
- Configure Workers Static Assets SPA fallback and the installable PWA manifest/minimal internet-required fallback.
- Add shared Zod error/ID/pagination contracts and structured safe logging.
- Establish Vitest, Workers integration tests, React Testing Library, and Playwright harnesses.
- Implement English i18next catalog plumbing and complete the documented [design-system foundation and `/ui` workbench](design-system-plan.md).

**Exit:** both apps run together locally, build independently, a health endpoint crosses the proxy, a migration applies to fresh local D1, baseline tests pass, and the linked design-system plan is complete.

The original platform-foundation scope was completed on 2026-09-29. It includes the pnpm workspace, independently buildable Workers/Vite apps, typed health proxy path, committed Drizzle migration, installable online-only PWA shell, shared contracts and safe logging, all four test harnesses, English localization, and the initial Mantine/CSS token theme.

The design-system foundation batch (DS-01 through DS-05) was completed on 2026-09-30: the web app now has generated TanStack routing with a production-safe `/ui` route, primitive and semantic CSS tokens, self-hosted OFL fonts, global accessibility defaults, and a Mantine theme bridge. The Phase 0 design-system expansion was completed on 2026-10-05 through visual-redesign Batch 3 with concentric surfaces, refined actions and form contracts, editorial composition and navigation primitives, hardened adaptive/confirmation dialogs, reveal/stagger utilities, an asymmetric production-safe `/ui` inventory, component accessibility coverage, focused Chromium/WebKit workbench coverage, and a verified production web build. Domain feature showcases continue to grow with their owning visual-redesign batches without reopening Phase 0.

## Cross-phase premium visual redesign — completed

The [visual redesign program](../VISUAL-REDESIGN-PLAN.md) began on 2026-10-04. It refreshes the delivered application through an Editorial Luxury texture direction and Editorial Split page composition while preserving Mantine, CSS Modules, product behavior, accessibility foundations, strict feed chronology, and the documented mobile bottom navigation.

Batch 1 established the governing direction, reconciled the existing Phase 0 design-system plan, repaired missing semantic tokens, inventoried migration debt, and recorded reproducible wide/narrow visual baselines. Batch 2 completed on 2026-10-04 with the refined semantic palette, expanded type/spacing/elevation/layout/motion tokens, self-hosted OFL-licensed Newsreader display family, updated Mantine bridge, fixed paper-grain canvas, and contrast/font-loading validation. Batch 3 completed on 2026-10-05 with the rebuilt shared primitives, editorial composition contracts, hardened overlays, reveal utilities, asymmetric `/ui` inventory, and focused accessibility/responsive verification. Batch 4 completed on 2026-10-05 with the detached desktop navigation island, route-aware light icons, refined group switcher and account utility, inset five-destination mobile dock, safe-area/floating-action clearance, and Chromium/WebKit shell coverage. Batch 5 completed on 2026-10-05 with the editorial journal header and create prompt, nested feed and discussion surfaces, shared composition fields, refined feed controls, spoiler-safe concealment, reaction and pin treatment, reading-wizard progress, observer-driven floating creation, corrected full-screen mobile dialogs, and focused newest-first/overflow coverage in Chromium and WebKit. Batch 6 completed on 2026-10-05 with editorial authentication, invitation, and status screens; asymmetric profile, member, and settings compositions; purpose-built upload and temporary-password treatments; quiet notification rows; semantic restricted/deleted states; and shared adaptive confirmations for destructive membership and group-lifecycle actions. Batch 7 completed on 2026-10-05 with restrained transform/opacity entry choreography across production page families, semantic interaction washes, audited easing/shadow/hairline/icon/blur contracts, long-label and authored-content containment at `390px`, `768px`, and `1440px`, stable light-theme authentication/`/ui`/journal baselines, and a passing Chromium/WebKit release suite. Batch 8 completed on 2026-10-05 with the browser-local `system` / `light` / `dark` preference, pre-paint resolution and synchronized chrome metadata, warm semantic dark mapping, shared accessible Settings control, deterministic dual-theme `/ui` demonstrations, stable light/dark baselines, and final component plus Chromium/WebKit gates for route containment, overlays, contrast, forced colors, reduced motion, and unfiltered media. The premium visual redesign program is complete.

## Phase 1 — Authentication, bootstrap, and tenant shell

- Implement user credential storage, signed 30-day cookies, sign-in/out, login throttling, and forced password change.
- Implement explicit-target bootstrap CLI.
- Implement groups, memberships, invitation registration, pending/rejected status, approval, and group creation.
- Add group-scoped authorization middleware and negative tenant tests.
- Build responsive application shell, local last-group selection, alphabetical switcher, and desktop/mobile navigation.

**Exit:** the first creator can bootstrap; another person can register only through an invite, be approved, and switch between isolated groups.

Completed on 2026-09-30. Phase 1 now includes the credential and membership migration, PBKDF2 password storage, signed sliding cookies, D1 login throttling, forced password changes, explicit local/remote bootstrap and operator password-setting CLIs, invitation registration and repeat requests, creator approval/rejection, active-membership tenant middleware, group creation, and the responsive group shell. Migrated Workers tests cover negative tenant access, and the Chromium/WebKit flow covers invite registration through approval plus group creation, switching, and mobile navigation.

## Phase 2 — Profiles and settings

- Add directly linkable group-private profiles, using fallback initials until avatar upload ships in Phase 5.
- Add the profile post list route, layout, and loading/empty shell; Phase 3 supplies the post data.
- Add display name, bio, password, and three-emoji settings.
- Add group rename.

**Exit:** members can open group-private profiles by direct link, manage the documented account settings, and rename groups they created; the profile post list is ready for Phase 3 data.

Completed on 2026-10-01. Phase 2 now includes group-scoped `/groups/:groupId/members/:userId` profiles with fallback initials and privacy-preserving former-member snapshots, the loading and empty profile-post shell, account display-name/bio/three-emoji settings, current-password-protected password changes, creator-only group rename, and typed desktop/mobile navigation to the new routes. The committed migrations backfill profile snapshots and reaction defaults. Workers integration tests cover validation, password and creator permissions, former profiles, and negative tenant access; React Testing Library and the Chromium/WebKit flow cover settings, direct profiles, the empty post shell, and rename behavior.

## Phase 3 — Posts, drafts, and feed

- Implement all four post schemas and validation.
- Implement responsive composer, type-state preservation, versioned account/group local drafts, edit/delete, and hidden notes.
- Implement newest-first cursor feed, infinite older loading, compact cards, dedicated detail routes, and profile post lists.
- Add newer-post polling and click-to-prepend control.

**Exit:** members can reliably create, edit, browse, and delete every post type without tenant leakage or draft loss.

Completed on 2026-10-01. Phase 3 now includes shared validation and a committed post/reading/fill migration; tenant-scoped create, read, edit, delete, feed, newer-post, detail, and profile-list APIs; and author/creator permissions with nested-ID isolation. The responsive composer preserves independent post-type state in a versioned account/group local draft, supports all four post shapes, and clears only on publish or discard. The journal uses stable newest-first cursor pages, older loading, 30-second newer-post polling with click-to-prepend reconciliation, concealed notes, compact cards, safe plain-text links, and canonical detail routes. Contract, Workers, and component suites cover post validation, structured persistence, cursors, tenant isolation, permissions, and draft behavior; the Chromium/WebKit flow publishes all four types and verifies notes, detail, edit/delete, and profile posts.

## Phase 4 — Answers, discussion, and reactions

- Implement two-level discussions and edited markers.
- Add conceal/reveal behavior and direct-link reveal.
- Implement reading wizard/local progress and structured answer sets.
- Implement fill-in ordered responses and optional positive matching.
- Add single answer pinning with author/creator permissions.
- Add default/custom reactions, emoji-grapheme validation, identity lists, and self-reactions.

**Exit:** every documented discussion and reaction flow passes component, integration, and critical end-to-end tests.

Completed on 2026-10-02. Phase 4 now includes tenant-scoped two-level discussions; concealed answer threads with explicit and direct-link reveal; versioned drafts for comments, replies, standalone answers, fill responses, and reading-wizard progress; complete reading answer sets with preserved question snapshots; ordered fill responses with optional positive matching; author/creator answer pinning; and idempotent post/comment reactions with custom emoji validation, self-reactions, and member identity lists. Shared contracts, migrated Workers tests, React Testing Library, and the Chromium/WebKit critical path cover validation, permissions, tenant isolation, concealment, structured submissions, replies, pins, and reactions.

## Phase 5 — Members, media, and group lifecycle

- Add the member directory and former-member presentation.
- Add public R2 avatar/group-icon upload with crop/type/size validation and cleanup.
- Add leave, remove, password regeneration, and group-icon update.
- Add group soft delete, deleted-group status, and restore.

**Exit:** the member directory, membership lifecycle, historical attribution, public image handling, and recoverable group deletion behave as documented.

Completed on 2026-10-03. Phase 5 now includes the active/former directory; snapshot-preserving leave and creator removal; one-time temporary passwords with forced change; square avatar and group-icon workflows backed by public R2 URLs with byte/type/animation/size checks and replacement cleanup; deleted-group session status; and creator-only soft deletion/restoration that preserves memberships and content. Shared contracts, a committed migration, Workers integration coverage, and localized member/settings UI cover the phase boundaries.

## Phase 6 — Notifications and release hardening

- Implement group-scoped notification records/page, read controls, restricted status notices, and deleted-target destinations.
- Complete empty, loading, failure, and connectivity-required states.
- Confirm current Chrome/Safari behavior and mobile composition/navigation.
- Complete manual deployment, D1/R2 backup, and restore runbooks using real configuration.
- Run full tenant-isolation and critical Playwright suites; deploy and conduct a small-group smoke test.

**Exit:** a clean production installation can be deployed, bootstrapped, backed up, restored, and used by the initial friend group.

Repository implementation completed on 2026-10-03: group-scoped on-demand notification records and read controls, restricted membership status notices, retained deleted-target destinations, localized empty/loading/failure states, responsive five-destination navigation, a connectivity-required fallback, a notification migration, and API/component/Chromium/WebKit coverage are present. The manual production runbook below is now command-specific. Phase 6 remains open until an operator supplies the real Cloudflare IDs/routes/credentials, completes the production deployment plus D1/R2 restore drill, records current Chrome/Safari checks, and conducts the initial friend-group smoke test; those external facts cannot be truthfully completed from the repository alone.

## Course phases

The [courses blueprint](courses.md) owns every course rule. Each phase is complete only when its code, migrations, tests, and documentation changes are done.

- **C1 — Course shell** (completed 2026-10-06): course create, edit, archive/restore, owner-only editing, draft/published status, wide cover image, library and course routes, and library navigation.

  C1 adds migration `0009_course_shell.sql` and the `courses` table. Members can create, edit, publish, unpublish, archive, and restore courses through owner-only and owner-or-creator endpoints. Covers use a 2:1 crop under `courses/` in R2, and superseded covers are cleaned up. The library at `/groups/$groupId/courses` is a newest-first cursor list, and each course has a page at `/groups/$groupId/courses/$courseId`. The main navigation now links to Courses. Workers tests cover tenant, nested-ID, visibility, permission, and cover-cleanup cases; React Testing Library covers the library and course pages.
- **C2 — Lessons and content blocks** (completed 2026-10-06): lessons and `heading`, `text`, `example`, and `dialogue` blocks; reordering; published flags; versioned conflict handling; paged course loading; local block drafts.

  C2 adds migration `0010_course_lessons_blocks.sql` with `course_lessons` and `course_blocks`. Course reads return the visible outline plus the first three lessons; later lessons load by ID. Owners create, edit, publish, reorder, and delete lessons and blocks; the group creator can delete them as moderation. Updates carry integer versions and stale writes return `409 VERSION_CONFLICT`. Block payloads are validated by per-kind shared schemas and stored with a payload version. Unsaved block edits persist locally under the `course-block` draft kind. The normalized acceptance fixture lives in `test/fixtures/courses/`. Contract, Workers, and React Testing Library tests cover the schemas, tenant and nested-ID isolation, permissions, conflicts, reordering, and the editor.
- **C3 — Practice blocks and answer threads** (completed 2026-10-06): `practice` blocks, concealed practice answer threads with replies and reactions, and authors' versions revealed only with the thread.

  C3 adds migration `0011_course_practice_threads.sql`. It rebuilds `course_blocks` for the `practice` kind and rebuilds `comments` so each comment targets exactly one post or practice block, with the new `practice_response` kind. Learner reads leave out authors' versions and notes. Editors receive them as a reference, and readers receive them only from the practice discussion endpoint the web calls on reveal. Answer sets snapshot prompts, practice threads have no pins, matching, or notifications, and block or lesson deletion removes threads and their reactions. The whole fixture, including its six practice blocks, now loads. Contract, Workers, React Testing Library, and Chromium/WebKit tests cover the payload split, cascades, snapshots, tenant and nested-ID isolation, and answering then revealing.
- **C4 — Feed presence** (completed 2026-10-06): a system-created `course` post on first publication linking to the course.

  C4 adds migration `0012_course_feed_posts.sql`. It rebuilds `posts` with a nullable, unique course link and the `course` type, and adds `courses.first_published_at`, backfilled for already-published courses so they get no retroactive post. The first publication creates the post in the same batch. Course posts show the live course on the card, become unavailable when the course is archived or unpublished, carry visible comments and reactions, and cannot be edited or pinned. The composer never offers the type. Workers, React Testing Library, and Chromium/WebKit tests cover single creation, availability, discussion rules, and tenant isolation.
- **C5 — Contributors** (completed 2026-10-06): contributor requests and decisions, contributor editing of unpublished content, owner-only publishing, attribution, and contributor notifications.

  C5 adds migration `0013_course_contributors.sql`. It adds `course_contributors`, which follows the membership states, and rebuilds `notifications` with a course link and the `contributor_requested`, `contributor_accepted`, and `contributor_rejected` kinds. Members ask to contribute from the course page, owners decide pending requests there, and contributors can withdraw, leave, or be removed. Contributors add lessons and blocks and edit only unpublished ones; publishing, reordering, deleting, and course settings stay with the owner. Leaving the group ends contributor roles. Workers, React Testing Library, and Chromium/WebKit tests cover the lifecycle, negative permissions, former contributors, notifications, and tenant isolation.

- **C6 — Lesson player and progress** (completed 2026-10-06): a step-by-step lesson player with a progress bar, dialogue lines and practice questions presented one at a time, and per-member course progress.

  C6 is an explicit product change requested by the group: it is the one exception to the no-gamification non-goal and stays non-competitive. It adds migration `0014_course_lesson_completions.sql` with `course_lesson_completions`, `GET .../courses/:courseId/progress`, and `PUT .../lessons/:lessonId/completion`. Progress is derived over currently published lessons and listed by name for every active member. The player shares the practice answer draft with the lesson view and can share an answer set to the practice thread. Workers, React Testing Library, and Chromium/WebKit tests cover completion rules, published-only counting, deletion, former members, unauthenticated access, tenant isolation, the stepping flow, and the progress panel.

  With C6 the planned course feature is delivered. Later course work is listed in the [courses blueprint](courses.md#deferred).

- **C6b — Lesson positions** (completed 2026-10-07): the player saves the step a member is on, reopens a started lesson there with Start over, and the course page offers Pick up where you left off. Later the course page's player entry was consolidated into one progress card at the top of the page (own percentage plus a single Continue, Start, or Practise again action); lessons no longer carry start buttons. Course percentages count the passed share of started lessons, so they move with each step, not only with finished lessons. It stays inside the C6 progress exception.

  C6b adds migration `0016_course_lesson_positions.sql` with `course_lesson_positions` and `PUT .../lessons/:lessonId/position`, and adds the viewer's `positions` to the progress payload. Steps are keyed by block ID so positions survive unrelated edits. Workers, contract, React Testing Library, and Chromium/WebKit tests cover saving, resuming, edits, privacy, deletion, refusals, and tenant isolation.

- **C7 — Lesson editor** (approved 2026-10-06, completed and released 2026-10-07; real-device input check and the Chromium `fixme` in `course-authoring.spec.ts` remain open): a Notion-style BlockNote editor with headings, restricted rich text, callouts, images, and 2–3 column layouts; one draft and one published document per lesson. The [lesson documents](courses.md#lesson-documents) rules own the design and [LESSON_EDITOR_PLAN.md](../LESSON_EDITOR_PLAN.md) holds the step-by-step delivery checklist. C7b, C7c, and C7d ship together because the migration removes the per-block routes.
  - **C7.0 — Docs and decisions** (completed 2026-10-06): invariants, content rules, and the lesson document design recorded.
  - **C7.1 — Spike** (completed 2026-10-06, real-device input check pending): BlockNote 0.55 works with Mantine 9.7 and React 19.3; a custom callout block, restricted styles, the slash menu, and two-column layouts work in Chromium and emulated iPhone WebKit. Findings that C7d must apply:
    - The editor chunk is about 232 KB gzipped and must stay lazy-loaded; the main bundle is unaffected.
    - `@blocknote/mantine/style.css` re-imports every Mantine component stylesheet unscoped, which would reorder the cascade over the app's CSS Modules. Vite aliases its `./mantineStyles.css` import to an empty file because the app already loads Mantine's styles; the remaining editor CSS (about 10 KB gzipped) is scoped to `.bn-` and `.ProseMirror`.
    - Restricting `styleSpecs` to bold, italic, `textColor`, and `backgroundColor` removes underline, strike, and code from the formatting toolbar.
    - The default UI still offers toggle headings (`createHeadingBlockSpec({ allowToggleHeadings: false })`), emoji, text alignment, block-level colours, and nesting on every block. C7a decides per item and the editor hides what the contracts reject.
    - Every built-in block carries `textColor`, `backgroundColor`, and `textAlignment` props; the contracts must accept or strip them.
    - Editor typography must come from design tokens: headings currently mix the app's global heading styles with BlockNote's Inter font, and the Inter import is dropped.
    - The side-menu gutter needs a narrow-screen override, and columns stay side by side inside the editor on narrow screens.
    - `pnpm add` re-resolves the app's `latest` specifiers; pin versions when installing BlockNote.
    - Decided after the spike: no text alignment, no toggle headings, block colours from the inline palette, nesting only for list items (3 levels), and emoji through a shared Frimousse-based `EmojiPicker` with self-hosted data, later reused by reactions.
  - **C7a — Contracts** (completed 2026-10-06): `@wordinator/contracts/lesson-document` holds the strict Zod schema for BlockNote-shaped lesson documents (inline styles, safe links, callouts, columns, list depth, block count, 256 KB cap, unique IDs, JSON-encoded dialogue and practice payloads), the draft-save and publish requests, the image upload response, and helpers for walking, practice IDs, image URL mapping, learner stripping with references, publish problems, player steps, and the v1 block upgrade. The lesson read response is defined with the API in C7b. It is a subpath export because it builds on the course schemas in the package index. Contract tests cover accepted BlockNote output, every rejection rule, the helpers, and upgrading the whole course fixture.
  - **C7b — Migration and lesson API** (completed 2026-10-06, released with C7): migration `0015` (draft and published documents, practice anchors, lesson media, comment rebuild, block table removal) and draft, publish, discard, unpublish, and image routes.
  - **C7c — Renderer and player** (completed 2026-10-07, released with C7): the read-only document renderer and document-based player steps.
  - **C7d — Editor core** (completed 2026-10-07, released with C7): the BlockNote editor, custom blocks, autosave, conflicts, and the publish bar. The authoring Playwright flow is `fixme` in Chromium pending a colour-menu investigation.
  - **C7e — Images** (completed 2026-10-07, released with C7; Playwright and real-browser check pending): uploads only through the lesson image dialog (whole image or 4:3, 16:9, square, and 3:4 crops, since react-easy-crop has no free aspect; browser re-encoding to JPEG under 1 MB with metadata dropped), alt text required for publishing, caption and preview width from BlockNote's image toolbar, and a daily cron sweep for images neither document references. See [lesson images](courses.md#images).
  - **C7f — Columns** (completed 2026-10-07, released with C7): two- and three-column slash items, edge-drop column creation with BlockNote's drop cursor, width handles, editor-side refusal of a fourth column or nested columns with in-place repair as a fallback, and stacked columns on narrow screens. See [block types](courses.md#block-types).
  - **C7g — Merge and polish** (completed 2026-10-07, released with C7): block-level three-way merge on `409` with side-by-side choices for blocks both sides changed, and paste sanitizing (pasted HTML and Markdown repaired to the lesson subset, foreign images removed, pasted image files through the upload dialog). See [drafts and publishing](courses.md#drafts-and-publishing) and [inline content](courses.md#inline-content).
- **C8 — New words and recap** (approved 2026-10-07, in progress; C8a–C8d completed 2026-10-07; migration `0017_course_lesson_words.sql` and the C8 API applied and deployed remotely on 2026-10-07; production lessons seeded with words on 2026-10-07; the C8c web deploy, the manual check of the seeded words, the smoke test, and the docs pass remain): a `vocabulary` block of words (term, meaning, optional forms, example, and note), New words panels on the player steps they follow, a lesson recap from the completion screen, and a course recap over the viewer's finished published lessons backed by the `course_lesson_words` index. A cross-course Words tab is deferred. See [new words and recap](courses.md#new-words-and-recap); [NEW_WORDS_PLAN.md](../NEW_WORDS_PLAN.md) holds the delivery checklist.

- **Lesson overview prototype** (experimental, started 2026-10-08, not approved): a development-only per-lesson overview road reading authored lesson files, to settle the design before any data layer or API. See [lesson overview](courses.md#lesson-overview-prototype).

## Settings split

Completed on 2026-10-06. The [settings and administration blueprint](settings-and-administration.md) owns the rules: Settings becomes Account, Group (creator only), and Members (creator only) pages. Membership decisions, removal, and password regeneration move to the Members page, the member directory becomes a social view, and image uploads gain an interactive move-and-zoom cropper.

## Mobile-friendly platform

Completed on 2026-10-07. The [mobile plan](../MOBILE_PLAN.md) removed the horizontal overflow that made phones zoom out, added a mobile token layer (type, header, dock, card inset, and page-header roles), a slim header with a four-slot dock and More sheet, a group switcher in the account menu, a hero-free journal with a one-line create prompt, flat post cards with footer reactions, flattened discussions, a full-screen composer with sticky title and action bars, a collapsible course outline, and compact page headers. The [design system](design-system.md#responsive-behavior) owns the rules. `mobile-layout.spec.ts` covers every authenticated route, the shell, journal, discussion, composer, course outline, and lesson player in Pixel 7, 360px, and iPhone 13 projects.

## Unprioritized future backlog

No ordering is implied.

- Replace the initial authentication/recovery model; add verified recovery and session revocation
- Account deletion and a broader privacy/data lifecycle
- Dutch and German UI catalogs with immediate active-group locale switching
- Formal accessibility audit and WCAG 2.2 AA improvements
- Full offline reading/mutation synchronization
- Search and feed/member filters
- Invitation-link rotation/revocation
- Group ownership transfer
- Notification aggregation, badges, and preferences
- Direct messages, friends/follows, blocking, muting, and reporting if the social model expands
- Further gamification or progress signals beyond course lesson progress, only if real users request them
- More target languages and intentional RTL support
- Contextual sentence rendering for fill-in responses
- Automated backups and CI/CD
- Course speaking practice, speak-and-repeat, and spoken answers (needs a product exception and privacy review)
- Course text-to-speech playback and interactive role-play dialogues
- Feed posts for course updates
- Course-specific notifications beyond contributor requests
- Images inside course blocks
- Stronger abuse protection and a global operator interface if deployment scope expands
