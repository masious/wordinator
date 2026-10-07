# Dutch Foundations — lesson authoring

Content workspace for the "Dutch Foundations" courses. Lessons are authored as JSON here, validated against the shared contracts, and imported into the **local** D1 as unpublished drafts for review in the app. Production is updated separately, by hand.

| Path | Owner | Purpose |
| --- | --- | --- |
| `outline.md` | user | The 40-lesson curriculum. Part II = rows 7–12, Part III = rows 13–18. |
| `bible.md` | coordinator | Storyline, characters, style rules, per-lesson briefs. |
| `ledger.md` | coordinator | What each lesson has actually taught (grammar, vocabulary, expressions). Updated after each lesson is accepted. |
| `part-ii/`, `part-iii/` | workers | One file per lesson: `NN-a-slug.json` (`NN` = outline row; `a`, `b` when a row is split). File-name order = lesson order. |
| `part-iii/existing/` | reference | The two lessons already in the course for row 13. Do not edit; do not re-cover them. |
| `*/course.json` | — | Import manifest (course ID, local group/owner, position offset). |
| `tools/lesson.ts` | — | Validator and SQL generator. |
| `tools/sample-lesson.json` | — | Reference showing every supported feature in the authoring shorthand. |

## Commands

Run from the repository root:

```bash
apps/api/node_modules/.bin/tsx content/dutch-foundations/tools/lesson.ts check content/dutch-foundations/part-ii/07-a-*.json
apps/api/node_modules/.bin/tsx content/dutch-foundations/tools/lesson.ts sql content/dutch-foundations/part-ii > /tmp/part-ii.sql   # coordinator/main session only
```

`check` assigns missing IDs and **writes them back into the file**, validates with the real `lessonDocumentSchema` and publish rules, and prints feature-usage counts. A lesson is done only when `check` prints `OK`.

## File format (authoring shorthand)

```json
{ "title": "…", "goal": "…", "blocks": [ … ], "imageIdeas": [ … ] }
```

Blocks follow BlockNote's `{ type, props, content, children }`. The tool fills in defaults, so you may omit `id`, default `props`, and empty `children`. `content` may be a plain string or an array of strings / `{ "text", "styles" }` / `{ "type": "link", "href", "content": [...] }`. See `tools/sample-lesson.json`.

| Type | Notes |
| --- | --- |
| `heading` | `props.level` 1–3 (default 2). Headings label the player steps that follow. ≤ 200 chars. |
| `paragraph` | Rich inline text. Block `textColor` / `backgroundColor` allowed. |
| `bulletListItem`, `numberedListItem` | Rich inline text; nest via `children`, max 3 levels. |
| `divider` | No content. |
| `callout` | `props.variant`: `hint`, `important`, `warning`, `grammar`, `culture`, `false-friend`, `pronunciation`. `props.icon`: `auto` or one of `lightbulb, megaphone, triangle-alert, book-open, globe, message-circle-warning, volume-2, info, star, heart, circle-check, circle-x, circle-help, sparkles, pencil, clock, map-pin`. |
| `example` | `content` = the Dutch sentence (rich; bold/colour the target form). `props.translation`, `props.note` plain text (≤ 1000 / 2000). The player hides the translation until tapped. |
| `dialogue` | `props.turns`: `[{ "speaker", "text" }]`, 1–50 turns, speaker ≤ 40 chars, plain text. Each turn is one player step. |
| `practice` | `props.data`: `{ instruction, passage?, items }`. Plain text only. 1–50 items. |
| `columnList` → `column` | 2–3 columns, top level only, never nested. Any block may sit in a column. `props.width` is a relative ratio (default 1). |
| `image` | **Not available to agents.** Images must be uploaded through the app. Put ideas in `imageIdeas` instead: `[{ "afterHeading": "…", "description": "…", "alt": "…" }]`. |

Inline styles: `bold`, `italic`, `textColor`, `backgroundColor` with palette `default, gray, brown, red, orange, yellow, green, blue, purple, pink`. Links: `http`/`https` only.

### Practice rules (contract-enforced)

- A prompt containing the single character `…` (U+2026) is a **fill-in item**. Each `…` is one blank. `authorsVersion` must have exactly one entry per blank, left to right. **Never use `…` for any other purpose** in a prompt; never write `...` as a blank.
- Any other prompt is **open** (translate, rewrite, answer, reorder, build a sentence). `authorsVersion` has exactly one entry.
- Every item must have an `authorsVersion`. Use `note` to explain the rule, accept alternatives ("Also fine: …"), or flag a common mistake.
- A `passage` (`{ title, content }`, `\n` for line breaks, ≤ 10,000 chars) makes the block a reading exercise whose items are its questions.
- Learners never see authors' versions or notes until they reveal the thread; there is no grading.

## House style

- Instruction and explanation language: **English**. Target language: Dutch at the level in the outline (A1 → early A2). Every Dutch sentence must be natural, correct Netherlands Dutch.
- Do not use grammar that the ledger has not introduced yet, except as a fixed, glossed chunk.
- One rule per callout; keep paragraphs short. Bold the target form in examples; use one consistent colour per grammatical role within a lesson (e.g. verb = blue, subject = green, time = orange).
- Each lesson stands alone inside the course storyline; recycle vocabulary and grammar from earlier lessons on purpose and say so in notes.
- The plain-text, no-gamification rules of `docs/courses.md` apply: no points, scores, streaks.
