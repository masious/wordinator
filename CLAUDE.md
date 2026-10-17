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
- User content is plain text, except course lessons. Preserve line breaks, escape output, and link only safe `http`/`https` URLs. AI tutor messages typed by the user are plain text too.
- Course lessons are the one rich-content surface: BlockNote documents restricted by the shared contracts to bold, italic, a token-mapped text palette, and safe links, as defined in `docs/courses.md`. Do not extend rich text or the BlockNote editor to posts, comments, or other surfaces. The AI tutor's assistant messages (C14, `docs/ai-tutor.md`) are a second, separate exception: a small Markdown subset (bold, italic, lists, inline code, short headings, safe links) rendered by Wordinator's own renderer without HTML, never with BlockNote. The one exception is a shared example sentence in a lesson share post (`docs/lesson-shares.md`), which keeps its lesson formatting through the read-only lesson renderer; the share's note stays plain text.
- Learning data (word reviews and memory, practice attempts, pronunciation attempts, and the tutor's plans, notes, topics, tutor words, observations, and personal practices) is stored per account and private to it; only the learner, their AI tutor, and the superuser's counts-only analytics read it. See `docs/security-and-privacy.md`.
- The AI tutor never receives journal posts, comments, other users' data, or credentials, and every tutor change to progress or shared content needs the user's in-chat confirmation.
- Lesson block IDs are stable across draft, merge, and publish; progress, positions, shares, speech, and AI practice anchors depend on them.
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

<!-- rtk-instructions v2 -->
# RTK (Rust Token Killer) - Token-Optimized Commands

## Golden Rule

**Always prefix commands with `rtk`**. If RTK has a dedicated filter, it uses it. If not, it passes through unchanged. This means RTK is always safe to use.

**Important**: Even in command chains with `&&`, use `rtk`:
```bash
# ❌ Wrong
git add . && git commit -m "msg" && git push

# ✅ Correct
rtk git add . && rtk git commit -m "msg" && rtk git push
```

## RTK Commands by Workflow

### Build & Compile (80-90% savings)
```bash
rtk cargo build         # Cargo build output
rtk cargo check         # Cargo check output
rtk cargo clippy        # Clippy warnings grouped by file (80%)
rtk tsc                 # TypeScript errors grouped by file/code (83%)
rtk lint                # ESLint/Biome violations grouped (84%)
rtk prettier --check    # Files needing format only (70%)
rtk next build          # Next.js build with route metrics (87%)
```

### Test (60-99% savings)
```bash
rtk cargo test          # Cargo test failures only (90%)
rtk go test             # Go test failures only (90%)
rtk jest                # Jest failures only (99.5%)
rtk vitest              # Vitest failures only (99.5%)
rtk playwright test     # Playwright failures only (94%)
rtk pytest              # Python test failures only (90%)
rtk rake test           # Ruby test failures only (90%)
rtk rspec               # RSpec test failures only (60%)
rtk test <cmd>          # Generic test wrapper - failures only
```

### Git (59-80% savings)
```bash
rtk git status          # Compact status
rtk git log             # Compact log (works with all git flags)
rtk git diff            # Compact diff (80%)
rtk git show            # Compact show (80%)
rtk git add             # Ultra-compact confirmations (59%)
rtk git commit          # Ultra-compact confirmations (59%)
rtk git push            # Ultra-compact confirmations
rtk git pull            # Ultra-compact confirmations
rtk git branch          # Compact branch list
rtk git fetch           # Compact fetch
rtk git stash           # Compact stash
rtk git worktree        # Compact worktree
```

Note: Git passthrough works for ALL subcommands, even those not explicitly listed.

### GitHub (26-87% savings)
```bash
rtk gh pr view <num>    # Compact PR view (87%)
rtk gh pr checks        # Compact PR checks (79%)
rtk gh run list         # Compact workflow runs (82%)
rtk gh issue list       # Compact issue list (80%)
rtk gh api              # Compact API responses (26%)
```

### JavaScript/TypeScript Tooling (70-90% savings)
```bash
rtk pnpm list           # Compact dependency tree (70%)
rtk pnpm outdated       # Compact outdated packages (80%)
rtk pnpm install        # Compact install output (90%)
rtk npm run <script>    # Compact npm script output
rtk npx <cmd>           # Compact npx command output
rtk prisma              # Prisma without ASCII art (88%)
```

### Files & Search (60-75% savings)
```bash
rtk ls <path>           # Tree format, compact (65%)
rtk read <file>         # Code reading with filtering (60%)
rtk grep <pattern>      # Search grouped by file (75%). Format flags (-c, -l, -L, -o, -Z) run raw.
rtk find <pattern>      # Find grouped by directory (70%)
```

### Analysis & Debug (70-90% savings)
```bash
rtk err <cmd>           # Filter errors only from any command
rtk log <file>          # Deduplicated logs with counts
rtk json <file>         # JSON structure without values
rtk deps                # Dependency overview
rtk env                 # Environment variables compact
rtk summary <cmd>       # Smart summary of command output
rtk diff                # Ultra-compact diffs
```

### Infrastructure (85% savings)
```bash
rtk docker ps           # Compact container list
rtk docker images       # Compact image list
rtk docker logs <c>     # Deduplicated logs
rtk kubectl get         # Compact resource list
rtk kubectl logs        # Deduplicated pod logs
```

### Network (65-70% savings)
```bash
rtk curl <url>          # Compact HTTP responses (70%)
rtk wget <url>          # Compact download output (65%)
```

### Meta Commands
```bash
rtk gain                # View token savings statistics
rtk gain --history      # View command history with savings
rtk discover            # Analyze Claude Code sessions for missed RTK usage
rtk proxy <cmd>         # Run command without filtering (for debugging)
rtk init                # Add RTK instructions to CLAUDE.md
rtk init --global       # Add RTK to ~/.claude/CLAUDE.md
```

## Token Savings Overview

| Category | Commands | Typical Savings |
|----------|----------|-----------------|
| Tests | vitest, playwright, cargo test | 90-99% |
| Build | next, tsc, lint, prettier | 70-87% |
| Git | status, log, diff, add, commit | 59-80% |
| GitHub | gh pr, gh run, gh issue | 26-87% |
| Package Managers | pnpm, npm, npx | 70-90% |
| Files | ls, read, grep, find | 60-75% |
| Infrastructure | docker, kubectl | 85% |
| Network | curl, wget | 65-70% |

Overall average: **60-90% token reduction** on common development operations.
<!-- /rtk-instructions -->