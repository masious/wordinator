# Wordinator agent guide

Wordinator is a private, self-hosted social language-learning application for a small group of friends. Read [docs/index.md](docs/index.md) before changing product behavior or architecture.

## Source of truth

The documents under `docs/` are part of the product, not historical notes. Use the ownership table in `docs/index.md` to find the authoritative document for a decision. When documents appear to conflict, stop and reconcile them before implementing the affected behavior. Notify the user of obselete documents and suggest to update them.

Documentation is part of the definition of done:

- Update every existing document affected by a behavior, schema, permission, workflow, design-token, operational, or architectural change.
- If a substantial new feature has no natural owning document, create a focused document for it and add it to `docs/index.md`.
- Update `docs/roadmap.md` when scope or delivery status changes.
- Do not leave documentation cleanup as unspecified follow-up work.
- Keep documents focused and link to the owner instead of duplicating rules in several places.

## Product invariants

- The product has one global course library. Groups, workspaces, language tenants, invitations, and join approvals are retired product concepts.
- Registration is open and immediate. A signed-in account must complete its username setup before using the library; the avatar is optional.
- Courses contain lessons. Do not introduce a second workspace or tenant boundary around either layer.
- The journal (posts, answers, comments, reactions, pins, and notices) is one global feed beside the library, shown as the third navigation tab. The feed is strict reverse chronology. Do not add ranking, filtering, search, or feed pinning without an explicit product change.
- Uploaded R2 images are intentionally public-by-URL.
- Answer concealment prevents accidental spoilers; it is not authorization.
- User content is plain text, except course lessons. Preserve line breaks, escape output, and link only safe `http`/`https` URLs.
- Course lessons are the one rich-content surface: BlockNote documents restricted by the shared contracts to bold, italic, a token-mapped text palette, and safe links, as defined in `docs/courses.md`. Do not extend rich text or the BlockNote editor to posts, comments, or other surfaces.
- No Tailwind.

## Planned repository shape

This repository begins documentation-first. The intended pnpm workspace is:

```text
apps/web       Vite, React, Mantine, TanStack Router and Query
apps/api       Hono Cloudflare Worker
packages/db    Drizzle schema, migrations and data access
packages/contracts  Shared Zod request/response contracts
packages/config     Shared TypeScript and test configuration, when useful
docs           Living product and engineering documentation
```

Do not invent a second source of shared API or database types inside either app.

## Engineering rules

- Use TypeScript strict mode. Avoid `any`; narrow unknown input at boundaries.
- Use pnpm workspace commands and keep the web and API independently buildable and deployable.
- Validate every API input with the shared contract package. Authorization is still enforced in the API, never trusted from the client.
- Prefer cursor pagination for ordered, growing collections.
- Keep route loaders small: they ensure critical route data; TanStack Query owns server-state caching and mutations.
- Use Drizzle with committed SQL migrations. Never change a deployed schema manually without capturing the equivalent migration.
- Use Mantine, CSS Modules, and the tokens in `docs/design-system.md`. Do not introduce Tailwind or repeated raw design values when a token exists.
- Put all visible UI copy behind i18next keys, even while English is the only shipped catalog.
- There is intentionally no ESLint or Prettier configuration. Match surrounding style and keep diffs readable.
- Never log passwords, temporary passwords, cookie values, invitation tokens, or post/comment bodies.

## Verification

Every implementation change must run the relevant subset of:

- TypeScript type-checking
- Vitest unit and integration tests
- React Testing Library component/flow tests
- Playwright critical-path tests
- Production builds for affected applications

Authentication and global-resource authorization tests are mandatory for protected API work. Changes to registration or onboarding require negative authorization and validation tests. Do not claim commands passed until the workspace and commands exist and were actually run.

## Safety and operations

- Local and production D1 targets must always be selected explicitly; never silently default a database command to production.
- Treat group deletion as recoverable soft deletion. Treat post/comment deletion according to `docs/data-model.md`.
- R2 replacement and deletion flows must clean up superseded objects where specified.
- Preserve local drafts across sign-out and namespace them by account, target item, and schema version.
- The initial auth model has deliberate limitations. Do not imply session revocation or stronger guarantees than `docs/authentication.md` provides.
