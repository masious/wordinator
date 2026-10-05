# Testing strategy

Wordinator’s highest-risk failure is data crossing group boundaries. Tests should optimize for confidence in permissions and core flows, not maximal line coverage.

## Layers

### Unit tests — Vitest

Cover pure validation and domain behavior:

- Ellipsis-token counting and expected-answer matching
- Emoji grapheme validation and uniqueness
- Safe URL detection
- Draft-key/version construction
- Membership transition rules
- Notification trigger decisions
- Cursor encoding/ordering
- Permission predicates

### API integration tests — Vitest and Workers test pool

Run Hono against isolated local D1 state using the Cloudflare Workers test environment. Cover repository queries, migrations, transactions/batches, signed cookies, route validation, and authorization failures.

Every group-owned endpoint needs at least one negative test using a valid member of a different group. Test nested-ID attacks where a valid group ID is paired with another group’s post/comment ID.

### Component tests — React Testing Library

Cover visible behavior rather than implementation details:

- Composer type switching and draft preservation
- Concealed answers and explicit reveal
- Reading wizard progress/skipped answers
- Reaction toggling and custom emoji validation
- Responsive navigation states
- Pending/rejected and internet-required screens
- Notification links to deleted or concealed content

### End-to-end tests — Playwright

Maintain a small critical suite for current Chromium and WebKit:

1. Bootstrap-created creator signs in.
2. New user registers from an invite, waits, is accepted, and enters the group.
3. User creates each post type; another user answers without spoilers.
4. Reading wizard publishes one complete answer set.
5. Reactions, replies, and pinning work with correct permissions.
6. A user in group A cannot access group B resources by URL or API ID.
7. Leaving/removal preserves content and shows the correct status.
8. Soft-deleting/restoring a group restores access and membership.
9. A creator-generated password forces change without pretending to revoke existing sessions.

## Fixtures

Use deterministic factories for at least two unrelated groups, multiple users, former/pending members, every post type, deleted targets, and a soft-deleted group. Never make tenant isolation tests depend on coincidentally sequential IDs.

## Release gates

Before declaring a phase complete:

- Affected TypeScript projects type-check in strict mode.
- Relevant Vitest and component tests pass.
- Critical Playwright paths pass when user-visible flows changed.
- Both affected deployables build for production.
- Migrations apply to a fresh local D1 database and upgrade the previous schema state.
- Affected documentation is updated.

There is intentionally no lint or format gate.

## Implemented foundation harness

Phase 0 establishes the runnable test layers used by later phases:

- shared-contract unit tests run in ordinary Vitest;
- API integration tests run the Worker entry point in the Cloudflare Workers Vitest pool with an isolated D1 binding;
- web component tests run React Testing Library in jsdom with Mantine browser APIs shimmed in shared setup;
- Playwright starts both local applications and verifies `/api/health` through Vite in Chromium and WebKit.

Use `pnpm test` for unit, component, and Workers integration tests. Use `pnpm test:e2e` for the browser harness after installing the configured Playwright browsers as described in [operations.md](operations.md).

Phase 1 adds migrated D1 integration coverage for invitation registration and approval, signed cookies, forced password change, login throttling, and cross-tenant group access/creator decisions. The Playwright fixture uses `.wrangler/e2e` as a separate local persistence directory, resets only that test database, seeds a creator, and exercises invitation registration, approval, group creation/switching, and responsive mobile navigation in Chromium and WebKit.

Phase 2 adds shared-contract tests for single-grapheme emoji and three-reaction uniqueness; migrated Workers integration tests for settings persistence, active snapshot refresh, ordinary password verification, former-profile privacy, negative profile tenant access, and creator-only rename; and React Testing Library coverage for the settings form, direct profile layout, and empty post shell. The critical Playwright flow also updates profile settings, renames a creator-owned group, opens the profile directly through typed navigation, and verifies the empty post-list state in Chromium and WebKit.

Phase 3 adds shared-contract coverage for all four post discriminators, required reading questions, literal ellipsis blank counting, and expected-answer cardinality. Workers integration tests apply the post migration and cover structured child hydration, strict cursor order, older/newer queries, profile post lists, edit/delete permissions, and nested cross-tenant post IDs. React Testing Library covers cross-type state preservation, account/group/version draft scoping, and clearing only after successful publication. The Chromium/WebKit path publishes all four post types, checks concealed notes and reading detail, edits/deletes a fill post, and confirms posts appear on the author profile.

Phase 4 adds shared-contract coverage for discussion discriminators and composed emoji; migrated Workers integration tests for structured cardinality, skipped reading answers, positive-only fill matching, reply depth, edit/delete/pin permissions, idempotent reaction toggles, identity lists, self-reactions, and nested cross-tenant IDs; and React Testing Library coverage for conceal/reveal, reading progress/draft cleanup, and custom emoji validation. The Chromium/WebKit critical path has a second member answer without spoilers, publish a reading answer set with a blank response, self-react, and then verifies creator pinning and a one-level reply.

Phase 5 adds Workers integration coverage for directory/former snapshots, leave/remove permissions, cross-tenant IDs, one-time password regeneration, forced change, deleted-group status/restore, image validation, public reads, icon permissions, snapshot refresh, and replacement cleanup. React Testing Library covers active/former presentation and the one-time password result. Chromium/WebKit cover approval into the directory, forced password change, leaving, former attribution, and delete/restore. Because the pinned Workers pool has a macOS R2 isolated-storage sidecar defect, the single R2 suite runs in its own non-isolated single-worker config; D1 suites retain normal isolation.

Phase 6 adds Workers integration coverage for notification creation, recipient/group isolation, restricted removal status, read state, and deleted destinations. React Testing Library covers unread presentation, deleted-target copy, and group mark-all. The Chromium/WebKit discussion flow opens the on-demand notification page, marks a group read, and follows pin/reply delivery to the other member. Release verification must run `pnpm typecheck`, `pnpm test`, `pnpm build`, and `pnpm test:e2e`; a real production smoke test remains an operator-recorded gate rather than an automated claim.
