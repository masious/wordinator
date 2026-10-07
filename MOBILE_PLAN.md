# Mobile-friendly platform plan

Working plan for making Wordinator comfortable on phones. Decisions agreed:

- Mobile dock has four slots: **Journal · Courses · Notices · More (⋯)**. More opens a bottom sheet with the remaining destinations.
- The group switcher lives inside the account menu (top right) on every screen size; the mobile header shows the current group name.
- Phases 0 and 1 ship together; later phases ship one at a time.
- Every visual change goes through tokens in `apps/web/src/tokens.css` and is documented in `docs/design-system.md`. No one-off sizes.

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done

## Phase 0 — Overflow guardrail and root-cause fixes

Symptom: content renders ~1.5× wider than the viewport while the header and dock fit it, so the browser zooms out and text looks tiny.

- [x] Add mobile Playwright projects (`mobile-chromium` Pixel 7, `mobile-narrow` 360px, `mobile-webkit` iPhone 13).
- [x] Add `e2e/mobile-layout.spec.ts` asserting no route is wider than the device viewport: feed, post detail, open composer, courses, course detail, members, profile, notices, settings. (Lesson player moves to Phase 7.)
- [x] Fix implicit `auto` grid columns on `.shellMain`, `.journal` (the actual culprit), `.feed`, `.detail`.
- [x] Fix the invite link not wrapping (`.invitePath` lived in the wrong CSS module).
- [x] Composer dialog: verified no overflow once the feed is fixed (the earlier screenshot inherited the feed's widened viewport).
- [x] Remove duplicated shell rules (`.switcher`, `.shellIcon`, `.mobileDock`, … duplicated in `GroupFrame.module.css` and `PhaseOnePages.module.css`); GroupFrame owns its styles.

## Phase 1 — Mobile token layer

- [x] Under `@media (max-width: 48em)` in `tokens.css`, redefine existing roles: `--type-page-title` ≈ 1.75rem, `--type-section-title` ≈ 1.375rem, `--navigation-height` 56px, `--mobile-dock-height` ≈ 64px, `--card-inset` 16px.
- [x] Add post typography roles: `--type-post-author` (15px sans semibold), `--type-post-meta` (13px mono), `--type-post-body` (authored role, 17–18px, line-height ≈ 1.55).
- [x] Apply it to `Surface` (bezel dissolves below 48em) and document the mobile rule "one bezel per surface; no nested shells below 48em" and the new roles in `docs/design-system.md`.

## Phase 2 — Header, dock, and account menu

- [x] Mobile header: slim 56px bar — brand mark, current group name, avatar. No floating island below 48em.
- [x] Account menu (all sizes): compact identity row (≈40px avatar, name, "My profile"), group switcher as a clean menu section listing groups with icon and a check on the current one (replaces the pill `<select>` with accent dot), Create a group, Settings, Sign out.
- [x] Dock: Journal · Courses · Notices · More. More opens a bottom `Drawer` with Members, My profile, Settings, Create a group, Sign out. More is marked current when the route belongs to it.
- [x] Hide the account name on mobile inside GroupFrame's own styles.
- [x] Update `docs/design-system.md` (replace "six-destination dock").
- [x] Restore the dock's inner glass core (`.mobileNav`), lost in the Phase 0 dedupe.
- [x] Move `CreateGroupForm` to `organisms/CreateGroupForm` so the shell can open it from any route.

## Phase 3 — Feed

- [x] Drop the page hero (group title, intro, Create a group) below 48em; title moves to the header, Create a group to the account menu / More sheet.
- [x] Replace the featured "Create a post" card with a one-line prompt row (avatar + "Write something…").
- [x] Keep the floating create action only after the prompt row scrolls away (fixed: the observer now attaches when the prompt mounts after the feed loads, not only on first render).
- [x] Add a mobile Playwright check for the hidden hero, prompt row, and floating action.

## Phase 4 — Post card

- [x] Single flat surface below 48em (no bezel shell).
- [x] Header row: 32px avatar · author + kind + time (post meta role) · inline ⋯ menu (no absolute positioning or reserved right padding).
- [x] Full-width body using `--type-post-body`.
- [x] Reactions move to a horizontal footer row (`ReactionBar` horizontal) next to the comment count.
- [x] Course post preview uses the same header/meta treatment.
- [x] Replace raw `background-color: white` on `.postActions:hover` with a token.
- [x] Remove the hard-coded `seen` count of `7` in the post actions menu.

## Phase 5 — Post detail and discussion

- [x] Flatten comment/reply shells below 48em (one frame per top-level comment; nested composers and replies go flat).
- [x] Reply indent 8px with a hairline rule.
- [x] Compact comment composer (tighter gaps, right-aligned submit, 2-row reply field); apply Phase 1 type roles (avatar + author/meta byline, post body role).
- [x] Add a mobile Playwright check for the flattened discussion and reply indent.

## Phase 6 — Full-screen composer

- [x] Sticky top bar (title + close).
- [x] Sticky bottom action bar (Discard / Publish) respecting `env(safe-area-inset-bottom)` and `dvh`, stays above the keyboard (`visualViewport` inset).
- [x] Flatten fieldsets; smaller legends.
- [x] Drop the theme's inline content border/shadow on the full-screen sheet (it lifted the sticky bar 1px off the bottom edge).
- [x] Add a mobile Playwright check for the sticky title and action bars and flat fieldsets.
- [x] Document the full-screen sheet and composer in `docs/design-system.md`.

## Phase 7 — Remaining pages

- [x] Add the lesson player to `mobile-layout.spec.ts` (example, dialogue, practice, and completion steps).
- [x] Remove the stray `.shellMain section { padding: 24px }` rule (it thickens every Surface bezel on desktop too) after checking discussion, lessons, and contributors sections.
- [x] Courses library and course page (collapsible lesson outline on mobile).
- [x] Members, profile, notices, settings with the new page-header roles (`--type-page-intro`, `--page-header-gap`, `--page-header-block-start/end`; profile avatar stays beside the name at `64px`).

## Phase 8 — Close-out

- [x] Update `docs/design-system.md`, `docs/posts-and-feed.md`, `docs/discussions-and-reactions.md`, `docs/courses.md`, `docs/roadmap.md`.
- [x] Refresh visual baselines (journal baselines now use their own empty group so earlier specs cannot leak into them).
- [x] Run typecheck, Vitest, Playwright (desktop + mobile), and production web build. Also fixed `phase-four.spec.ts` for the Settings split and scoped the motion audit to first-party CSS. Known pre-existing WebKit flake: `dual-theme-gate` route/contrast tests intermittently hit "Frame load interrupted".
