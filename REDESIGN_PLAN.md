# Lumen redesign plan

**Status: approved (2026-10-16).** Batches 0–3 and 6 are done; the first Batch 7 Tutor slice is done; Batch A (WCAG checks) is next, then Batch 4. The owner settled D1–D11 on 2026-10-16 and added the Batch 4 product changes; D2's phone action bar awaits confirmation. Management pages are last (Batch M).

This plan moves Wordinator from the Editorial Luxury look (warm paper, coral, Newsreader, bezels, pills, a top navigation island) to the **Lumen** direction: a cool canvas, white cards with line borders, one violet accent, Inter, small radii, a left navigation rail, and the three reference compositions (course library, lesson reader, tutor). [docs/design-system.md](docs/design-system.md) owns every value; this file owns order, scope, and completion. Each batch rewrites the design-system rules it replaces, so the doc never describes two systems for the same component.

## Ground rules

- **Look, not behaviour.** Routes, data, permissions, i18n keys, and product rules stay. Anything in the reference screens that Wordinator does not have (course search, a sort menu, Home, Help center, lesson bookmarks, references and sources, read time, online status, attachments) is **left out** unless an open decision below adds it as a product change.
- **Tokens only.** Components use semantic roles from `tokens.css`. No raw colours, no Tailwind (the reference stylesheet's `@import "tailwindcss"` and Google Fonts import are not carried over; Inter is self-hosted).
- **Both schemes.** Dark mode comes from the token mapping. A batch is not done until its screens are checked in light and dark.
- **Desktop and phone.** Desktop (`1280px` and wider, not breaking at `62em`–`75em`) is the primary composition, and every UI decision also has a specified phone equivalent (below `48em`) that ships in the same batch (D2, owner 2026-10-16). Phone support is not being retired. Each batch lists its phone behaviour.
- **Verification.** Visual matching and testing are manual (owner). Each batch still runs `pnpm --filter @wordinator/web typecheck`, the Vitest suites for touched components, and `vite build`, and fixes tests that assert removed structure or copy. Pixel baselines are deleted (D8); automated accessibility coverage is the basic WCAG checks in Batch A.

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
| `.course-card` | Course library cards | Cover band (course cover, or the lesson cover on lesson cards; `--color-art-*` band only when there is none), badge, title, meta, progress, footer note and chevron (D4) |
| `.featured-course` | `CourseResume` | Dark `--color-feature-*` panel with a decorative visual half |
| `.lesson-item`, `.lesson-rail__course` | Course page lesson rows; the lesson box in the app rail | No separate lesson rail (Batch 6) |
| `.concept-callout` | Lesson `Callout` | Tinted panel, round icon tile, eyebrow, title, body; tone per callout type |
| `.lesson-pagination` | Lesson pager | Secondary Previous, centred Up next, primary Next lesson |
| `.reference-item`, `.reference-panel` | Lesson vocabulary panel | Search on top; word rows with a Speak / Bookmark / Expand stack |
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

## Batch 2 — `/ui` workbench (done 2026-10-16)

Rebuild `pages/UiWorkbench.tsx` in the reference layout: hero (eyebrow with version, title, intro, the rotated ink mark), **01 Foundations** (six swatches: ink, canvas, paper, accent, soft blue, soft lime; then display, heading, body, and label specimens), **02 Controls** (buttons, fields and progress, status and identity), **03 Product patterns** (course card, reference item, conversation turns), then the existing light/dark preview scopes and the remaining inventory (forms, dialogs, states) under the same section style. Real exported components only, i18n copy.

Done when: `/ui` matches the reference sheet in light and has a correct dark scope; `phase-one.spec.ts` workbench heading assertion updated.

Outcome: rebuilt as listed, sections numbered 01–05 (the dual-theme previews are 04, the remaining inventory 05); the heading text is unchanged, so `phase-one.spec.ts` needed no edit. Per D8 the pixel-baseline tests (`stable light-theme visual baselines`, `stable dual-theme visual baselines`) and their snapshot folders were deleted; the structural, contrast, and overflow specs stay. Visual check is the owner's.

## Batch 3 — Application shell (done 2026-10-16)

Replace the detached top island in `organisms/GroupFrame` with the Lumen product frame: a sticky full-height left rail (`--size-app-rail`, `--color-surface-raised`, right line border) with the brand, primary navigation (`rail-item`, active on `--color-action-soft`), and a footer profile row (avatar, name, `@username`, menu button opening the existing account menu: Settings, Sign out). Content area on `--color-surface`. Remove the grain layer and page glows from `index.css`.

- Navigation items, in order: Courses, Words, Journal, Tutor, Notifications (D1).
- **Course sub-items** (approved 2026-10-16): under Courses, the rail lists every course the viewer can see, in library order, as indented sub-items linking to the course page; the current course is marked active. The group is collapsible with a disclosure button on the Courses item, expanded by default; the collapsed state is a per-device convenience in `localStorage` (keyed by account). This is how the full course list stays reachable now that `/courses` shows lessons.
- Below the rail breakpoint (`68rem` in the reference) a slim header with the brand and a menu button that opens the rail as a drawer (D2).
- The lesson page keeps the app rail and extends it (Batch 6).
- Retire `--navigation-height`, `--navigation-offset`, `--shell-clearance` uses tied to the island; the lesson reading progress bar moves to the top of the content column.

Done when: every authenticated route renders inside the rail frame; skip link and `aria-current` preserved; shell sections of design-system.md rewritten.

Outcome: `GroupFrame` is the rail frame (the lesson and drill pages keep it until Batch 6); below `68rem` a slim header opens the rail in a Mantine drawer, and the phone dock and More sheet are gone (D2). `ShellIcon` was replaced by Lucide icons. The grain layer, page glows, and grain tokens were removed; `--mobile-dock-clearance` now only covers the safe area. The lesson progress bar starts at `--shell-inline-start`. Specs updated: `phase-one`, `mobile-layout`, `dual-theme-gate`, `light-theme-gate` (stroke `1.5px`), `phase-three` and `words-tab` (exact link names). The shell had no skip link before this batch; none was added. **Open with the owner (D2):** the owner does not retire phone support; whether the drawer is the phone equivalent of the old dock or the bottom dock comes back is to be confirmed.

## Batch 4 — Course library (`/courses`)

Approved product change (2026-10-16): the library page becomes a learning dashboard. It replaces the current `/courses` page; the full course list moves to the rail (Batch 3).

- **Page header**: eyebrow (Your learning space), Course library, intro; Create course stays in the tools slot. No search (D5).
- **Continue learning** (`CourseResume` as the dark feature panel): the course the viewer touched most recently (latest saved position or completion across all courses; when there is none, the first course in the library). Content half: In progress badge, course title, summary, Lesson n of m, then **two meters**: the current lesson's storyline share and, below it, the course progress; primary Resume lesson (same target rules as today's `CourseResume`). **Visual half: the AI tutor** (D6) — tutor mark, a short pitch, and Ask your tutor, which opens `/ai` with a new conversation (with the lesson as context when the tutor offers that). This retires `TutorCta` and `--gradient-tutor`.
- **Lesson grid** with a section heading on the left and a view select on the right:
  - **Recent lessons** (default): one card per lesson the viewer touched most recently across courses (positions and completions, newest first; up to nine). Card: art band (course tone), course badge, lesson title, Lesson n of m, **two meters** (lesson storyline share, then course progress), and a footer row with a chevron button that **expands the card's metrics**:
    - **Word recency**: when the viewer last reviewed a word from the lesson ("3 days ago", or Not practised yet) and the share of the lesson's words reviewed in the last 7 days.
    - **Memory strength**: the lesson's words in three bands — Strong (recall now ≥ 0.9), Fading (reviewed, below 0.9), New (no memory) — as counts and a stacked bar. Bands only; the recall probability itself is still never shown (owner-approved change to [words.md](docs/words.md#word-memory)).
    - **Pronunciation fluency** (built in Batch 6's lesson-metrics read): the average Azure fluency score (0–100) of the viewer's pronunciation attempts on the lesson's words, with the attempt count; "No spoken attempts" otherwise.
  - **Not started**: course cards for published courses with no position, completion, or word review by the viewer (art band, level badge, title, lesson count, Start course).
  - The select is a per-device convenience (`localStorage`); there is no other filtering.
- **Covers** (D4): Not started cards show the course cover and Recent lessons cards the lesson cover (the lesson's first image, as on the course page); the `--color-art-*` band appears only when there is no image.
- **Phone**: the header tools wrap under the title; the feature panel stacks the tutor half under the content half; the grid is one column; the metrics expand in place.
- **API**: one private read for the dashboard (contract in `packages/contracts`, course visibility applies, viewer-only like the Progress tab) returning the resume course, the recent lessons with both meters and metrics, and the not-started courses; metrics are computed at read time from `word_reviews`, `word_memory`, `course_lesson_words`, and `pronunciation_attempts`. Owner docs: [courses.md](docs/courses.md) (library page), [words.md](docs/words.md) (bands), [data-model.md](docs/data-model.md) if indexes are added, [security-and-privacy.md](docs/security-and-privacy.md) (still private learning data).
- Tests: contract tests, API authorization and privacy tests (another account's data never appears), RTL for the panel, grid, view select, and the expanding metrics.

## Batch 5 — Course page

- Course page: page header with course badge, title, summary, and the course progress meter; lessons as `lesson-item`-style rows in one bordered list (number circle or check, title, goal, practice status, lesson actions on the right); lesson cover images keep their left-edge fade, retuned to the card surface; Contributors as a context card.
- Phone: lesson rows keep today's cover banner across the top and stack their actions.

## Batch 6 — Lesson page

Owner design (2026-10-16). Three columns: the app rail (extended for the lesson), the reading column, and the vocabulary panel. Two product changes are marked **(product)**.

**0. Mono restore (D3).** Before the lesson work, give `MetadataRow` and `LabelChip` back their DM Mono role (Batch 1 had switched them to Inter); page modules keep their mono uses.

**1. Left: app rail with the lesson inside it.** No separate lesson rail; the app rail stays.

- **In this lesson** moves from the side column into the rail: under the active course's sub-item, the current lesson expands into its index (headings and practices, indented by level, practices in italics). It keeps today's behaviour from [courses.md](docs/courses.md#lesson-pages): click to scroll, passed entries muted, the current entry marked on the rule and kept in view. The expanded block scrolls on its own if long. Other courses stay collapsed.
- **Lesson box**: a card pinned under the rail's navigation items (above the profile row) for the current lesson only:
  - lesson progress (the reading-progress share as a `ProgressMeter` with its percent);
  - **Practise words**: opens a word drill of this course's words **(product: new drill source `course`, `/words/drill?source=course&course=<id>`; owner doc [words.md](docs/words.md#drill))**;
  - **Ask for more practices like this**: opens `/ai` with a new conversation, the lesson as context, and a prefilled request for more practices on this lesson's topics; the tutor's existing personal-practice flow and confirmations apply **(product; owner doc [ai-tutor.md](docs/ai-tutor.md))**;
  - **Fluency**, only when data exists: per [practice topic](docs/tutor-sessions-and-memory.md#practice-topics) practised under this lesson, the label, answered and missed counts, and last practised; plus the lesson's pronunciation fluency average (the Batch 4 metric). No data, no section.
  - Data comes from one private lesson-metrics read (contract in `packages/contracts`, viewer-only, course visibility applies). Batch 4's dashboard reuses it.
- The thin lesson progress bar at the top of the content stays; the box adds the actions and fluency.

**2. Centre: reading column.**

- **Lesson cover** (D4): the lesson's first image (the same one the course page's lesson list uses, by the same published/draft rules) as a full-width banner at the top, `--radius-lg`, cropped to fill; none without an image.
- Header: breadcrumb (course › Lesson n) and the existing actions; Lesson nn badge, the title at `--text-display`, the goal as the dek, metadata (new-word count, practice count).
- Prose at `--type-authored` / `--line-reading`; callouts as concept callouts; examples, dialogues, and practice panels restyled as bordered Lumen panels (practice eyebrow and status stay mono); pager with Up next. Player, docked answer dialog, share selection, and AI practices restyled in place.

**3. Right: vocabulary panel** (`--size-reference-panel`, sticky). Same functions as today's New words panel, new look.

- A search field at the top (today's lesson word search, with the This lesson | Library switch below it).
- Word rows as Lumen reference items on `--color-core` with a line border (no ochre panel): term, meaning, and at the row end one attached vertical **button stack**: Speak, Bookmark, Expand. Speak appears only when the word has a generated audio clip; Bookmark and Expand always. Expanded rows show forms, example (its speaker only with audio), note, and the Learnt in link as today.
- On-screen highlighting and dimming of words stay as today.

**Wide-but-not-desktop** (`62em`–`75em`): the vocabulary panel narrows to its minimum; below `62em` it moves under the text.

**Phone** (D2): the rail (with the lesson index and lesson box) is reached through the phone's dynamic action bar; the vocabulary panel opens as a bottom sheet from the same bar; the cover spans the screen width; the pager keeps Previous and Next.

**Docs**: rewrite the lesson-page rules in [courses.md](docs/courses.md#lesson-pages) and [design-system.md](docs/design-system.md); add the course drill source to [words.md](docs/words.md#drill); add the lesson-metrics read to [security-and-privacy.md](docs/security-and-privacy.md) (private learning data).

**Tests** (API work is not covered by the manual-testing rule): contract tests; authorization and privacy tests for the lesson-metrics read and the course drill source (another account's data never appears, invisible courses refused); RTL for the rail index, lesson box (with and without fluency data), vocabulary button stack (Speak hidden without audio).

**Outcome (done 2026-10-16):** shipped as listed, with these changes. The vocabulary panel is a **right rail** docked to the window's right edge, sticky and full height like the app rail (owner, 2026-10-16), rather than a sticky card in the content column; the frame gains a third column only while the lesson page fills it, and window-fixed bars stop at it (`--shell-inline-end`); new token `--size-reference-panel-min` for `62em`–`75em`. The rail slots (index, lesson box, right rail) are portals from the lesson page into `GroupFrame` (`useRailSlots`); a collapsed course list still shows the current course with its index. **Fluency** shows only the pronunciation average: practice topics are C14l and not built yet, so per-topic figures wait for it. **Ask for more practices like this** prefills a new conversation through `/ai?prompt=` (the lesson is named in the request; C14l's context scope does not exist yet). The phone action bar has Contents (opens the rail drawer with the index and lesson box) and Words (bottom sheet); D2's reading is still to confirm. API: `GET .../lessons/:lessonId/metrics` and `word-drill?source=course&courseId=`. Docs: courses.md (lesson pages, new Lesson box section), words.md (course source), security-and-privacy.md, ai-tutor.md (`prompt`), design-system.md. The pre-existing AI settings form test failure is unrelated. Visual check is the owner's.

**Follow-up (owner, 2026-10-16):** lesson index entries keep to one line with an ellipsis; on a lesson page with the course list expanded, Courses is promoted to the rail's heading and Words, Journal, and Tutor become an icon row with tooltips above the lesson box; the lesson box adds Ask AI beside Practise words (a new tutor conversation prefilled to talk the lesson's grammar and topics through), and its Fluency block adds Words remembered well and Last studied from the extended lesson-metrics read ([courses](docs/courses.md#lesson-box)).

## Batch 7 — Tutor (`/ai`)

- **Header**: tutor mark (accent tile with sparkle and `--shadow-accent`), conversation title and short tutor description, model picker, a three-dots Conversation details action, and Archive. Conversation details owns renaming, the session summary, token usage, progress counts, and recent tool calls.
- **Turns**: avatars on both sides; assistant turns in a bordered `--color-surface` card with a "Tutor · AI" meta row, then the Markdown body (headings at card-title size, numbered lists as the step list with round accent-soft numbers); user turns as accent bubbles with white text and the ink avatar on the right. Tool steps, confirmation cards, plan parts, and answer components sit inside the assistant card. Lesson links render as source chips.
- **Composer**: floating card (`--shadow-floating`, `--radius-lg`) over the column bottom with the textarea, "Enter to send" hint, and primary Send with icon; the question dock takes the same frame.
- **Context panel**: the shell's right reference rail, present above `75em`, starts with the current conversation, then a Session context card with learner-turn and completed-activity counts plus up to four recent visible tool results. The prototype's Try asking position temporarily shows a deterministic excerpt of the session rather than prompt suggestions (D9).
- **Conversation list**: continues the app rail directly under Tutor (D10), with single-line titles fading at the end like course titles. It remains reachable through the navigation drawer below the rail breakpoint.
- Phone layout is one chat column; Conversations opens the navigation drawer and the context rail is omitted.

**Outcome (done 2026-10-16, first slice):** the page shell, header, conversation placement, context rail, session excerpt, and conversation-details dialog shipped. The richer assistant/user turn-card treatment, source chips, and composer hint remain later Batch 7 work.

## Batch 8 — Words and Drill

- Words: page header with the Bookmarks | Weak words segmented control, lesson filter, and Drill in the tools slot; word cards as Lumen cards (white, line border, `--radius-lg`); weak-word rows as reference items with the result dots.
- Drill: centred card on `--color-core`, prompt as eyebrow, term in the display role, Again / Got it as secondary / primary with `<kbd>` hints; verdict badge and pronunciation breakdown in Lumen tints.
- Phone: header tools wrap; cards one column; drill buttons fill the width.

**Outcome (done 2026-10-16):** shipped as listed, look only (no route, data, or copy changes). Words: the header uses the accent `Eyebrow` and the shared page title; the switch, lesson filter (label visually hidden at every width, still naming the field), and Drill sit on one tools row that wraps. Word cards (`WordRecap`, shared with the lesson recap dialogs) and drill cards are Lumen cards on `--color-core`, so `--color-words-card` was retired; the drill card moves from `--radius-xl` to `--radius-lg`. Weak-word rows are flat reference items (term at `--type-card-title`, accent-tinted border on hover and focus; the empty dot ring moves to `--color-separator` to stay visible on paper). Drill: centred header, prompt as the `Eyebrow`, term in the display role, `<kbd>` hints as a wash of the button's ink; verdict badge flat in soft tints, pronunciation meters on the `--size-progress` hairline track, word chips on the band's soft tint; setup choices became Lumen tiles (chosen on `--color-action-soft`); summary tiles tinted by result. The Words tab's round Say it button, bookmark toggle, and focus outlines follow the Lumen icon button and the global focus ring. Phone: word cards go to one column below `48em` (was `40em`); the drill, summary, and setup buttons share the width; weak-word rows put the dots and actions under the word. The tutor words view does not exist in code yet, so nothing was restyled for it. Docs: design-system.md (words, drill, weak words), words.md (breakpoint and tone names). Visual check is the owner's.

## Batch 9 — Journal, post detail, notifications

- Journal stays one reverse-chronological column. Create prompt row, post cards as Lumen cards (avatar, author, meta, body, reactions row), post-type labels as badges, discussions as chat-like nested rows without bezels, pins and concealed answers on their soft tints.
- Post detail and composer dialog: Lumen dialog and fields.
- Notifications: quiet rows separated by lines, unread on `--color-action-soft`.
- Phone: cards drop their outer margin to the page gutter; the composer stays the full-screen sheet with the sticky action bar.

## Batch 10 — Auth, setup, settings, states

- Sign in, register, and setup: centred Lumen card on the canvas with the brand mark (no editorial split).
- Settings: page header plus section cards (account, appearance, speech recognition, tutor).
- Empty, error, loading, and restricted states, offline page, 404.
- Phone: the auth card fills the width; settings sections stack.

## Batch M — Management pages (last priority)

Owner direction (2026-10-16): management surfaces come last, after every learner-facing batch.

- Manage course page: course details, cover, publishing, Contributors, and the lesson tools as Lumen cards, fields, and button groups.
- Lesson editor chrome (toolbar, publish bar, merge conflicts, image dialog, practice and vocabulary fields); BlockNote content styles follow the lesson reader's prose roles. Editor behaviour untouched.
- Admin analytics and AI settings: Lumen tables (line rows, faint headers, tabular figures) and form cards.
- Phone: the manage tools take a full-width row; tables scroll inside their card; the editor keeps today's phone behaviour.

## Batch A — Basic WCAG checks (Storybook)

Owner direction (D8, 2026-10-16): pixel baselines are gone; add basic automated WCAG checks through the existing Storybook.

- Add `@storybook/addon-a11y` (axe) and run it as tests through Storybook's Vitest integration, failing on WCAG 2.x A/AA violations (`color-contrast`, names, roles, labels).
- Stories, light and dark: the shared `ui` exports (Button variants and states, IconButton tones, LabelChip and Avatar tones, Eyebrow, Surface, fields, PageHeader, SectionHeader, dialogs), `ProgressMeter`, `Callout`, the shell rail and drawer, and the existing journal post stories. Later batches add stories for the pieces they build.
- Wire a `test:a11y` script; update [testing.md](docs/testing.md#storybook), which today calls Storybook a local preview outside every gate, and the `.storybook/main.ts` comment.
- Runs after Batch 6, before Batch 4.

## Batch 11 — Cleanup and documentation

- Remove `--font-display` / `--font-serif` aliases, bezel and shell radius tokens, `--shadow-inset-highlight`, grain tokens, navigation-island tokens, `--color-page-glow` / `--color-page-accent`; rename `--palette-*` users if any remain.
- Replace the Editorial rule list in design-system.md with Lumen rules; update `docs/what_is_it.md` if it describes the stationery look; record the outcome in `docs/roadmap.md`; delete this plan.

## Open decisions

| # | Question | Recommendation |
| --- | --- | --- |
| D1 | Rail items and order. The reference has Home, Library, Tutor, Help center. | **Done (Batch 3):** Courses (with course sub-items), Words, Journal, Tutor, Notifications; Settings and Sign out in the profile menu; no Home or Help center. |
| D2 | Narrow widths and phone support. | **Decided:** phone support is not retired; every UI decision gets a phone equivalent. The phone gets a new **dynamic action bar** instead of the old fixed dock: its slots change with the page and carry that page's equivalents of the desktop actions (for example, on a lesson: Contents, Words, Lesson box, Menu). The slim header and drawer from Batch 3 stay for the full navigation. *Reading of the owner's "another dynamic equivalent for similar actions"; to confirm.* The bar is built with Batch 6 and each later batch defines its slots. |
| D3 | DM Mono. | **Decided:** kept for metadata, counters, practice and post-type labels, and `<kbd>`. Batch 6 restores it in `MetadataRow` and `LabelChip`; Lumen page eyebrows stay Inter. |
| D4 | Covers. | **Decided:** course and lesson covers are used wherever they exist (library cards, course page), and the lesson page opens with the lesson's cover (Batch 6). The art band is only the no-image fallback on cards. |
| D5 | Course search in the library header? | **Decided:** left out. |
| D6 | Tutor call to action on `/courses`. | **Decided:** the feature panel's visual half becomes the AI tutor entry; the gradient card and `--gradient-tutor` are retired. |
| D7 | Lesson page composition and the reference "principle grid". | **Decided:** the grid is dropped; the lesson page is the owner's three-column design in Batch 6. |
| D8 | Playwright screenshot baselines. | **Done:** deleted in Batch 2. **Decided:** add basic WCAG checks through Storybook (Batch A). |
| D9 | Tutor "Try asking" suggestions. | **Decided (2026-10-16):** use the position for a deterministic summary excerpt of the current session for now; real suggestions remain a possible later change. |
| D10 | Tutor conversation list: the reference has no list. | **Decided (2026-10-16):** recent conversations continue the app rail directly under Tutor, using the course-title fade treatment. |
| D11 | Batch order. | **Decided:** the left rail first (Batch 3, done), the lesson page next (Batch 6), then A, 4, 7, 5, 8, 9, 10; management pages last (Batch M), then cleanup (11). |
