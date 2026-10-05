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

Dependencies flow inward: apps may depend on packages; shared packages must not depend on apps. Database implementation types do not leak into client contracts.

## Web application

- React and TypeScript strict mode
- Mantine for accessible primitives and theme integration
- CSS Modules and CSS custom properties for product styling
- TanStack Router with file-based, generated, type-safe routes and code splitting
- TanStack Query for remote data, infinite queries, mutations, invalidation, and new-post polling
- i18next/react-i18next for every visible string; English is the only initial catalog
- Vite PWA integration for install metadata and a minimal offline fallback only

Route loaders ensure authentication and critical route data. TanStack Query owns cache lifetime, pagination, refetching, and mutations. Do not maintain parallel hand-written server caches.

The implemented product routes are `/`, `/invite/$token`, `/groups/$groupId`, `/groups/$groupId/posts/$postId`, `/groups/$groupId/members/$userId`, and `/groups/$groupId/settings`. Invitation, group, post-detail, profile, and settings loaders prime TanStack Query, while protected loaders redirect signed-out or forced-password-change sessions before private content renders. The production-safe `/ui` route remains outside authenticated product flows.

Suggested group routes use opaque IDs, for example `/groups/$groupId`, `/groups/$groupId/posts/$postId`, `/groups/$groupId/members/$userId`, and `/groups/$groupId/notifications`.

## API application

Use Hono on the Cloudflare Workers runtime and Web-standard APIs. “Node.js” describes the toolchain; production code must use Workers-compatible APIs. Keep route modules aligned to domains: auth, groups, membership, posts, discussions, reactions, notifications, profiles, and media.

API conventions:

- JSON REST under `/api`
- Shared Zod validation at request and response boundaries
- Stable opaque IDs; never place mutable names in identity routes
- Consistent error envelope with a machine code, safe message, and optional field issues
- Correct HTTP status semantics
- Cursor pagination for feed, profile posts, discussions if needed, and notifications
- Idempotent toggles or explicit desired reaction state to tolerate retries
- Authorization in the API for every operation, regardless of client guards

Phase 1 authentication is stateless: middleware verifies and slides the signed cookie, then group middleware loads current active membership and group facts from D1 for each tenant route. The browser never supplies trusted role or membership facts.

Phase 2 profile reads and group rename reuse that group middleware. `/api/settings` owns account-wide display name, bio, and quick reactions; `/api/auth/change-password` owns credential changes; `/api/groups/:groupId/members/:userId` owns group-private current/former profile reads plus its cursor-paged post list; and `PATCH /api/groups/:groupId` is creator-only.

Phase 3 adds `GET/POST /api/groups/:groupId/posts` and `GET/PATCH/DELETE /api/groups/:groupId/posts/:postId`. Every route first proves active membership through the same group middleware, then scopes nested post IDs by both `group_id` and post ID. Authors may edit or delete their posts; the group creator may additionally delete any group post. Feed and profile queries use descending `(created_at, id)` cursors, and the feed endpoint accepts a mutually compatible `newerThan` cursor for polling. TanStack Query owns infinite older pages, mutation reconciliation, detail data, and the 30-second newer-post check; local storage owns only the versioned unsent composer draft.

Phase 4 adds a post discussion read, nested comment creation/edit/deletion, a single-pin mutation, and explicit desired-state reaction toggles for posts and comments. Every comment route proves both the group and parent post before resolving the comment ID. Structured reading/fill submissions are validated against server-owned post children, and fill expected answers never enter ordinary post or discussion payloads. TanStack Query owns discussion/reaction refreshes; local storage owns only versioned unsent writing progress and ephemeral reveal state stays in the page visit.

Phase 5 adds member-directory, leave, remove, password-regeneration, avatar, group-icon, soft-delete, restore, and public-media endpoints. Deleted groups bypass normal group middleware only for the narrowly scoped creator restore endpoint. Sessions keep active and deleted groups separate so a deleted tenant never enters the active switcher.

Phase 6 adds on-demand group notification list/read-one/read-all endpoints and a narrowly scoped authenticated status-notification endpoint for accepted, rejected, and removed membership events. Normal notification operations use the same active-membership tenant middleware as other group data. Notification destinations keep opaque post/comment IDs after target deletion and resolve availability at read time.

## Database

Cloudflare D1 is the relational system of record. Drizzle provides typed schema/query access through the D1 binding. Drizzle Kit generates committed SQL migrations; Wrangler applies the same migration directory to explicit local or remote targets.

Use transactions/batches where a logical mutation spans multiple records and D1 supports the required atomic behavior. Index every frequent tenant-scoped access path beginning with `group_id` where appropriate.

Migration `0005_phase_three_posts.sql` adds `posts`, `reading_questions`, and `fill_expected_answers`, including feed/profile indexes and cascading structured-child cleanup. Migration `0006_phase_four_discussions.sql` adds comments, structured response items, post pins, and polymorphic reactions with tenant/target indexes and uniqueness for one user/target/emoji. Post and comment deletion is hard deletion and explicitly cleans reaction targets that relational cascades cannot represent.

## Images

The API validates type and size and coordinates image metadata. R2 stores static PNG/JPEG/WebP objects under unguessable `avatars/` and `groups/` keys. Objects are publicly readable by URL by product decision. Client-side square cropping improves UX; server-side validation remains authoritative. `MEDIA` is the R2 binding and `PUBLIC_MEDIA_BASE_URL` is the public URL prefix returned in contracts.

## PWA behavior

The product is installable but online-only. Cache only the minimum static offline fallback needed to show an intentional internet-required page on a cold offline launch. Do not cache API responses for offline use and do not queue mutations. New service-worker versions should avoid silently discarding local-storage drafts.

## Environments and delivery

There are two targets: local development and one production installation. A root workspace command runs web and API concurrently. Each app retains independent development, test, build, and Wrangler deployment commands. Deployment is manual; there is no CI/CD initially.
