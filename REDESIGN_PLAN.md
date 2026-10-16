# Lumen redesign plan

**Status: approved (2026-10-16).** Batch 0 is done; Batches 1–3 are next, then Batch 4. The owner settled D5, D6, and D11 and added the Batch 4 product changes on 2026-10-16; the remaining decisions take their recommendation unless the owner revises them.

This plan moves Wordinator from the Editorial Luxury look (warm paper, coral, Newsreader, bezels, pills, a top navigation island) to the **Lumen** direction: a cool canvas, white cards with line borders, one violet accent, Inter, small radii, a left navigation rail, and the three reference compositions (course library, lesson reader, tutor). [docs/design-system.md](docs/design-system.md) owns every value; this file owns order, scope, and completion. Each batch rewrites the design-system rules it replaces, so the doc never describes two systems for the same component.

## Ground rules

- **Look, not behaviour.** Routes, data, permissions, i18n keys, and product rules stay. Anything in the reference screens that Wordinator does not have (course search, a sort menu, Home, Help center, lesson bookmarks, references and sources, read time, online status, attachments) is **left out** unless an open decision below adds it as a product change.
- **Tokens only.** Components use semantic roles from `tokens.css`. No raw colours, no Tailwind (the reference stylesheet's `@import "tailwindcss"` and Google Fonts import are not carried over; Inter is self-hosted).
- **Both schemes.** Dark mode comes from the token mapping. A batch is not done until its screens are checked in light and dark.
- **Desktop first.** Design target is `1280px` and wider, must not break at `62em`–`75em`. Phone layouts stay maintained-but-frozen; each batch only keeps them usable (see decision D2).
- **Verification.** Visual matching and testing are manual (owner). Each batch still runs `pnpm --filter @wordinator/web typecheck`, the Vitest suites for touched components, and `vite build`, and fixes tests that assert removed structure or copy. Playwright screenshot baselines are handled per decision D8.

## Reference component map

How each Lumen component lands in the existing code. "New" means a new shared export in `apps/web/src/ui`.

| Lumen component | Wordinator target | Notes |
| --- | --- | --- |
| `.button` primary / secondary / ghost / disabled | `Button` variants `primary` / `secondary` / `quiet` / `danger` | `--radius-sm`, `--control-height`, `0.82rem` semibold, `-1px` hover lift; the trailing icon island becomes a plain trailing glyph |
| `.button--icon` | `IconButton` `default` tone | Square `--control-height`, paper surface, line border, accent border and glyph on hover; `quiet` and `primary` tones keep their roles |
| `.button--switcher`, `.reference-tabs` | Mantine `SegmentedControl` theme + `ThemePreferenceControl`, Active/Archived toggle, Bookmarks/Weak words | Paper track with line border; active option on `--color-inverse-surface` |
| `.eyebrow` | New `Eyebrow`; replaces the mono uppercase eyebrows (about 38 CSS modules use `--font-mono`) | Accent, `--type-eyebrow`, bold, `--tracking-eyebrow` |
| `.badge` default / accent / success / warm | `LabelChip` gains `tone`; post-type labels, lesson state chips, "Just for you", AI practice | Pill, soft tint, `0.65rem` bold |
| `.avatar` ink / accent / soft | `Avatar` gains `tone` | Initials in `--color-action-soft-text` on soft; tutor mark is the accent tone with a sparkle |
| `.meta` | `MetadataRow` | Faint `0.75rem` with a leading line icon |
| `.progress-wrap` | `ProgressMeter` | `0.28rem` track on `--color-hairline`, accent fill, label row above (label and percent) |
| `.search-field` | Mantine input theme (search look reused by the lesson word search) | No new search feature (D5) |
| `.brand` | Shell brand | 2×2 rotated mark on `--color-inverse-surface`, one tile in the accent; the name stays Wordinator |
| `.course-card` | Course library cards | Art band on `--color-art-*`, category badge, title, meta, progress, footer note and chevron (D4 for covers) |
| `.featured-course` | `CourseResume` | Dark `--color-feature-*` panel with a decorative visual half |
| `.lesson-item`, `.lesson-rail__course` | New lesson rail on the lesson page | Numbered circle, check for finished, accent fill for current |
| `.concept-callout` | Lesson `Callout` | Tinted panel, round icon tile, eyebrow, title, body; tone per callout type |
| `.principle` | Lesson column blocks where they fit (D7) | Ink top rule on paper-soft |
| `.lesson-pagination` | Lesson pager | Secondary Previous, centred Up next, primary Next lesson |
| `.reference-item`, `.reference-panel` | Lesson side panel (index and New words) | Tabbed panel; items are bordered cards with a number chip |
| `.chat-turn`, `.composer`, `.tutor-header`, `.context-card`, `.source-chip` | Tutor chat, composer, header, side panel, lesson links | See Batch 7 |
| `.workbench-*` | `/ui` | See Batch 2 |
| `.section-heading`, `.page-header` | `SectionHeader`, `PageHeader` | Eyebrow, title, intro, tools on the right |

## Batch 0 — Tokens and palette (done 2026-10-16)

- `tokens.css`: Lumen primitives and semantic roles for light, dark, and both `/ui` preview scopes; new roles `--color-foreground-faint`, `--color-action-soft`, `--color-action-soft-text`, `--color-inverse-*`, `--color-feature-*`, `--color-art-*`, `--shadow-accent`, `--line-reading`, and the shell sizes `--size-app-rail`, `--size-lesson-rail`, `--size-context-panel`, `--size-reference-panel`, `--width-conversation`; compact type scale, radii, shadows, gutters, control heights, and motion; grain set to zero; unused compatibility aliases removed.
- Fonts: `@fontsource-variable/inter` replaces Manrope and Newsreader in the app and Storybook; `--font-display` and `--font-serif` alias Inter. DM Mono stays until D3.
- `theme.ts`: Mantine colour keys renamed (`accent`, `support`, `highlight`, `surface`), motion constants matched.
- Browser chrome colour, offline page, and the font and theme-colour assertions in e2e updated.
- `docs/design-system.md` colour, typography, spacing, shape, and motion sections rewritten.

Expect existing screens to look half-migrated after this batch: Lumen colours inside Editorial shapes (pills, bezels, the island). That is intended until Batches 1–3 land.

## Batch 1 — Shared components (done 2026-10-16)

Files: `apps/web/src/ui/index.tsx`, `WordinatorUi.module.css`, `theme.ts`, `molecules/ProgressMeter`, `molecules/Callout`.

1. `Button`: Lumen geometry for all variants; replace the icon island with a trailing glyph (keep the `trailingIcon` prop); `ButtonGroup` attaches at `--radius-sm`.
2. `IconButton`: square tones as in the map.
3. `Surface`: drop the bezel shell; `default` becomes one card (`--color-core`, line border, `--radius-lg`, `--shadow-card`); `featured` uses the feature roles; `inset` uses `--color-surface`; `quiet` and `danger` keep their roles. Hover lift for linked cards (`-0.2rem`, `--shadow-raised`).
4. New `Eyebrow`; `LabelChip` and `Avatar` gain tones; `MetadataRow` gets the leading icon slot.
5. `PageHeader` and `SectionHeader` to the Lumen header (eyebrow, page title, intro, tools slot; section heading with optional trailing ghost action).
6. Mantine theme: Button and ActionIcon radius `sm`, inputs `md` with the search-field focus ring (accent border, `0.18rem` soft ring), Modal radius `lg` without blur-glass, Menu and Popover radius `md`, `SegmentedControl` defaults, Tooltip on ink.
7. `ProgressMeter`, `Callout`: Lumen looks.
8. Focus: `0.18rem` accent outline at `0.15rem` offset everywhere (`index.css`).
9. Icons: one line set at Lumen weight (`1.5px` stroke, `small` `1rem`, `medium` `1.25rem`); audit `ShellIcon` and inline SVGs.

Done when: every export renders Lumen in both schemes; Vitest for `ui`, molecules, and touched organisms pass; design-system "Component character" and "Reusable component contract" sections rewritten.

Outcome: shipped as listed. New tokens `--type-badge`, `--size-progress`, `--size-avatar`, `--focus-ring-width`, `--focus-ring-offset`; new exports `Eyebrow`, `MetadataItem`, `LabelChip` and `Avatar` tones, `ProgressMeter` `showLabel`. Switchers and the input focus ring are styled globally in `index.css`; Lucide icons take a `1.5` stroke globally. D3 (DM Mono) is applied to shared components only; page modules drop the mono role in their own batches. Light/dark visual check is the owner's.

## Batch 2 — `/ui` workbench

Rebuild `pages/UiWorkbench.tsx` in the reference layout: hero (eyebrow with version, title, intro, the rotated ink mark), **01 Foundations** (six swatches: ink, canvas, paper, accent, soft blue, soft lime; then display, heading, body, and label specimens), **02 Controls** (buttons, fields and progress, status and identity), **03 Product patterns** (course card, reference item, conversation turns), then the existing light/dark preview scopes and the remaining inventory (forms, dialogs, states) under the same section style. Real exported components only, i18n copy.

Done when: `/ui` matches the reference sheet in light and has a correct dark scope; `phase-one.spec.ts` workbench heading assertion updated.

## Batch 3 — Application shell

Replace the detached top island in `organisms/GroupFrame` with the Lumen product frame: a sticky full-height left rail (`--size-app-rail`, `--color-surface-raised`, right line border) with the brand, primary navigation (`rail-item`, active on `--color-action-soft`), and a footer profile row (avatar, name, `@username`, menu button opening the existing account menu: Settings, Sign out). Content area on `--color-surface`. Remove the grain layer and page glows from `index.css`.

- Navigation items, in order: Courses, Words, Journal, Tutor, Notifications (D1).
- **Course sub-items** (approved 2026-10-16): under Courses, the rail lists every course the viewer can see, in library order, as indented sub-items linking to the course page; the current course is marked active. The group is collapsible with a disclosure button on the Courses item, expanded by default; the collapsed state is a per-device convenience in `localStorage` (keyed by account). This is how the full course list stays reachable now that `/courses` shows lessons.
- Below the rail breakpoint (`68rem` in the reference) a slim header with the brand and a menu button (D2).
- The lesson page and drill page swap the app rail for their own rail (Batch 6).
- Retire `--navigation-height`, `--navigation-offset`, `--shell-clearance` uses tied to the island; the lesson reading progress bar moves to the top of the content column.

Done when: every authenticated route renders inside the rail frame; skip link and `aria-current` preserved; shell sections of design-system.md rewritten.

## Batch 4 — Course library (`/courses`)

Approved product change (2026-10-16): the library page becomes a learning dashboard. It replaces the current `/courses` page; the full course list moves to the rail (Batch 3).

- **Page header**: eyebrow (Your learning space), Course library, intro; Create course stays in the tools slot. No search (D5).
- **Continue learning** (`CourseResume` as the dark feature panel): the course the viewer touched most recently (latest saved position or completion across all courses; when there is none, the first course in the library). Content half: In progress badge, course title, summary, Lesson n of m, then **two meters**: the current lesson's storyline share and, below it, the course progress; primary Resume lesson (same target rules as today's `CourseResume`). **Visual half: the AI tutor** (D6) — tutor mark, a short pitch, and Ask your tutor, which opens `/ai` with a new conversation (with the lesson as context when the tutor offers that). This retires `TutorCta` and `--gradient-tutor`.
- **Lesson grid** with a section heading on the left and a view select on the right:
  - **Recent lessons** (default): one card per lesson the viewer touched most recently across courses (positions and completions, newest first; up to nine). Card: art band (course tone), course badge, lesson title, Lesson n of m, **two meters** (lesson storyline share, then course progress), and a footer row with a chevron button that **expands the card's metrics**:
    - **Word recency**: when the viewer last reviewed a word from the lesson ("3 days ago", or Not practised yet) and the share of the lesson's words reviewed in the last 7 days.
    - **Memory strength**: the lesson's words in three bands — Strong (recall now ≥ 0.9), Fading (reviewed, below 0.9), New (no memory) — as counts and a stacked bar. Bands only; the recall probability itself is still never shown (owner-approved change to [words.md](docs/words.md#word-memory)).
    - **Pronunciation fluency**: the average Azure fluency score (0–100) of the viewer's pronunciation attempts on the lesson's words, with the attempt count; "No spoken attempts" otherwise.
  - **Not started**: course cards for published courses with no position, completion, or word review by the viewer (art band, level badge, title, lesson count, Start course).
  - The select is a per-device convenience (`localStorage`); there is no other filtering.
- **API**: one private read for the dashboard (contract in `packages/contracts`, course visibility applies, viewer-only like the Progress tab) returning the resume course, the recent lessons with both meters and metrics, and the not-started courses; metrics are computed at read time from `word_reviews`, `word_memory`, `course_lesson_words`, and `pronunciation_attempts`. Owner docs: [courses.md](docs/courses.md) (library page), [words.md](docs/words.md) (bands), [data-model.md](docs/data-model.md) if indexes are added, [security-and-privacy.md](docs/security-and-privacy.md) (still private learning data).
- Tests: contract tests, API authorization and privacy tests (another account's data never appears), RTL for the panel, grid, view select, and the expanding metrics.

## Batch 5 — Course page and manage page

- Course page: page header with course badge, title, summary, and the course progress meter; lessons as `lesson-item`-style rows in one bordered list (number circle or check, title, goal, practice status, lesson actions on the right); lesson cover images keep their left-edge fade, retuned to the card surface; Contributors as a context card.
- Manage page and lesson editor chrome: Lumen fields, buttons, and cards; BlockNote content styles follow the lesson reader's prose roles. Editor behaviour untouched.

## Batch 6 — Lesson reader

Three columns at `1280px+`: lesson rail, reading column, side panel.

- **Lesson rail** (`--size-lesson-rail`, sticky): Back to course, course card (Course badge, title, progress), the course's lesson list as `lesson-item`s (check for finished, number otherwise, accent for current). Replaces the app rail on this route.
- **Reading column**: header bar with breadcrumb (course › Lesson n) and the existing actions; article intro with Lesson nn badge, the title at `--text-display`, the lesson goal as the dek, and metadata (new-word count, practice count); prose at `--type-authored` / `--line-reading`; callouts as concept callouts; examples, dialogues, and practices restyled as bordered paper-soft panels; pager with Up next.
- **Side panel** (`--size-reference-panel`): eyebrow and title, a segmented control **Contents | Words** replacing the stacked index and New words panels; index entries and word rows become reference-item cards (number or term, meaning, speaker and bookmark actions as the item's icon buttons). Keeps the current-entry tracking, dimming, and highlight behaviour from `docs/courses.md`.
- Below `75em` the lesson rail collapses behind a menu button; below `62em` the side panel drops under the text.
- Player, answer dialog (docked), share selection, and AI practices restyled in place.

## Batch 7 — Tutor (`/ai`)

- **Header**: tutor mark (accent tile with sparkle and `--shadow-accent`), conversation title with the rename pencil, model picker, Archive, and a settings icon button. No online badge (D9 for the status line).
- **Turns**: avatars on both sides; assistant turns in a bordered `--color-surface` card with a "Tutor · AI" meta row, then the Markdown body (headings at card-title size, numbered lists as the step list with round accent-soft numbers); user turns as accent bubbles with white text and the ink avatar on the right. Tool steps, confirmation cards, plan parts, and answer components sit inside the assistant card. Lesson links render as source chips.
- **Composer**: floating card (`--shadow-floating`, `--radius-lg`) over the column bottom with the textarea, "Enter to send" hint, and primary Send with icon; the question dock takes the same frame.
- **Context panel** (`--size-context-panel`): current lesson card on `--color-action-soft` (eyebrow, title, Lesson n of m, Open lesson) when the conversation has a lesson context; Session panel (plan steps and counts) as a context card with a count badge; suggested prompts as Try asking rows only if they already exist (D9); usage box; the accuracy note at the bottom.
- **Conversation list**: placement per D10.
- Phone layout keeps one pane at a time (tutor is the documented phone exception).

## Batch 8 — Words and Drill

- Words: page header with the Bookmarks | Weak words segmented control, lesson filter, and Drill in the tools slot; word cards as Lumen cards (white, line border, `--radius-lg`); weak-word rows as reference items with the result dots.
- Drill: centred card on `--color-core`, prompt as eyebrow, term in the display role, Again / Got it as secondary / primary with `<kbd>` hints; verdict badge and pronunciation breakdown in Lumen tints.

## Batch 9 — Journal, post detail, notifications

- Journal stays one reverse-chronological column. Create prompt row, post cards as Lumen cards (avatar, author, meta, body, reactions row), post-type labels as badges, discussions as chat-like nested rows without bezels, pins and concealed answers on their soft tints.
- Post detail and composer dialog: Lumen dialog and fields.
- Notifications: quiet rows separated by lines, unread on `--color-action-soft`.

## Batch 10 — Auth, setup, settings, admin, states

- Sign in, register, and setup: centred Lumen card on the canvas with the brand mark (no editorial split).
- Settings: page header plus section cards (account, appearance, speech recognition, tutor).
- Admin analytics: Lumen tables (line rows, faint headers, tabular figures).
- Empty, error, loading, and restricted states, offline page, 404.

## Batch 11 — Cleanup and documentation

- Remove `--font-display` / `--font-serif` aliases, bezel and shell radius tokens, `--shadow-inset-highlight`, grain tokens, navigation-island tokens, `--color-page-glow` / `--color-page-accent`, and DM Mono if D3 retires it; rename `--palette-*` users if any remain.
- Replace the Editorial rule list in design-system.md with Lumen rules; update `docs/what_is_it.md` if it describes the stationery look; record the outcome in `docs/roadmap.md`; delete this plan.

## Open decisions

| # | Question | Recommendation |
| --- | --- | --- |
| D1 | Rail items and order. The reference has Home, Library, Tutor, Help center. | Courses, Words, Journal, Tutor, Notifications; Settings via the profile menu; no Home or Help center. |
| D2 | Narrow widths: the reference hides the rail below `68rem`. The phone dock is frozen behaviour. | Slim header with a menu button that opens the rail as a drawer below `68rem`; retire the phone dock and More sheet (docs already freeze phone work). |
| D3 | DM Mono: the reference has no mono. | Retire it; metadata in Inter with `font-variant-numeric: tabular-nums`; `<kbd>` and code keep `ui-monospace`. |
| D4 | Course cards: real cover images or the generated art band? | Cover image when present, art band (tone cycled by course, glyph by level) otherwise. |
| D5 | Course search in the library header? | **Decided:** left out. |
| D6 | Tutor call to action on `/courses`. | **Decided:** the feature panel's visual half becomes the AI tutor entry; the gradient card and `--gradient-tutor` are retired. |
| D7 | Lesson "principle grid": no matching block type exists. | Skip; restyle only existing block types. |
| D8 | Playwright screenshot baselines (dual-theme gate, `/ui`, auth) will all fail. | Delete the screenshot assertions; keep structural, accessibility, and contrast specs and fix them per batch. |
| D9 | Tutor header status line and "Try asking" suggestions. | Status line: the active plan or context summary; Try asking only from existing prompt references, otherwise omit. |
| D10 | Tutor conversation list: the reference has no list. | Put it in the context panel's top card (collapsible, recent first) and keep the full list behind a Conversations button; or keep a left list column between the rail and the chat. |
| D11 | Batch order. | **Decided:** 1 → 2 → 3 → 4, then 6, 7, 5, 8, 9, 10, 11. |
