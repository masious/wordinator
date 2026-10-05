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

Completed on 2026-09-30. Phase 1 now includes the credential and membership migration, PBKDF2 password storage, signed sliding cookies, D1 login throttling, forced password changes, explicit local/remote bootstrap CLI, invitation registration and repeat requests, creator approval/rejection, active-membership tenant middleware, group creation, and the responsive group shell. Migrated Workers tests cover negative tenant access, and the Chromium/WebKit flow covers invite registration through approval plus group creation, switching, and mobile navigation.

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
- Gamification or progress signals only if real users request them
- More target languages and intentional RTL support
- Contextual sentence rendering for fill-in responses
- Automated backups and CI/CD
- Stronger abuse protection and a global operator interface if deployment scope expands
