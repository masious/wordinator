# Course content documentation

Curriculum, storyline and coverage tracking for the member-authored **Dutch Foundations** courses. The lesson files themselves, the validator and the import manifests live in [`content/dutch-foundations/`](../../content/dutch-foundations/README.md); how lessons render and play is owned by [courses.md](../courses.md). These documents own *what* is taught, *in which order*, *in which story*, and *what is still missing*.

The 40-row curriculum is [`content/dutch-foundations/outline.md`](../../content/dutch-foundations/outline.md) (owned by the user). Current state: Part I is being written (plan in [briefs-part-i.md](briefs-part-i.md), 12 lessons planned); Parts II and III are finished (all lessons accepted and imported); Part IV content is complete (19-a through 24-b accepted; course imports are tracked in its ledger); Part V is complete (25–29 accepted and imported to production as unpublished drafts); Part VI is complete (30–36 accepted and imported to production as unpublished drafts); Part VII is complete, with all four accepted lessons published in production. See [ledger-part-vii.md](ledger-part-vii.md).

## Documents

| Document | Owns | Updated by | When |
| --- | --- | --- | --- |
| [storyline.md](storyline.md) | Setting, cast, timeline, lesson-by-lesson story beats, fixed story facts | coordinator | Before workers start; when an accepted lesson establishes a new story fact |
| [style-guide.md](style-guide.md) | Lesson skeleton, colour convention, callout use, tone, global off-limits grammar, practice template, feature checklist, worker requirements | coordinator | When a convention changes (then check existing lessons) |
| [briefs-part-i.md](briefs-part-i.md) | Part I overview (scope, arc, cast, timeline, Part-I-wide off-limits, volume targets for beginners, English support) and per-lesson briefs for rows 1–6 | coordinator | Before a lesson is written; briefs are the plan, not the record |
| [briefs-part-ii.md](briefs-part-ii.md) | Per-lesson briefs for Part II (rows 7–12): scope, grammar facts, vocabulary, recycling, off-limits, practice plan | coordinator | Before a lesson is written; briefs are the plan, not the record |
| [briefs-part-iii.md](briefs-part-iii.md) | Per-lesson briefs for Part III (rows 14–18) | coordinator | As above |
| [briefs-part-iv.md](briefs-part-iv.md) | Part IV overview (scope, arc, cast, timeline, known knowledge, Part-IV-wide off-limits) and per-lesson briefs for rows 19–24 | coordinator | As above |
| [briefs-part-v.md](briefs-part-v.md) | Part V overview and briefs for rows 25–29 | coordinator | As above |
| [briefs-part-vi.md](briefs-part-vi.md) | Part VI overview and lesson briefs | coordinator | Before a lesson is written |
| [briefs-part-vii.md](briefs-part-vii.md) | Part VII overview, scope, story arc and briefs for rows 37–40 | coordinator | Before a lesson is written |
| [ledger-part-i.md](ledger-part-i.md) | Part I target: the knowledge later parts assume, which Part I must teach; then what each Part I lesson actually teaches, the lessons table and the course ID | coordinator | After each Part I lesson is reviewed and accepted, from the lesson file; when the target changes |
| [ledger-part-ii.md](ledger-part-ii.md) | What each Part II lesson actually teaches: grammar with depth, vocabulary with de/het, expressions, story facts, deviations | coordinator | After each lesson is reviewed and accepted, from the lesson file |
| [ledger-part-iii.md](ledger-part-iii.md) | Same for Part III, including the two existing row-13 lessons | coordinator | As above |
| [ledger-part-iv.md](ledger-part-iv.md) | Same for Part IV; also records course IDs and lesson import status | coordinator | As above |
| [ledger-part-v.md](ledger-part-v.md) | What each accepted Part V lesson actually teaches and its course/import status | coordinator | As above |
| [ledger-part-vi.md](ledger-part-vi.md) | What each accepted Part VI lesson actually teaches and its course/import status | coordinator | After each Part VI lesson is reviewed and accepted |
| [ledger-part-vii.md](ledger-part-vii.md) | What each accepted Part VII lesson actually teaches and its course/import status | coordinator | After each Part VII lesson is reviewed and accepted |
| [topic-map.md](topic-map.md) | Cross-part map of every grammar topic: where introduced, where reinforced, status (`covered`/`partial`/`assumed`/`deferred`/`missing`) | coordinator | With every ledger update |
| [illustrations.md](illustrations.md) | Visual canon (style, how characters and places look), reference sheets, the `imageIdeas` generation fields and the `illustrate.ts` workflow | coordinator | When a character or place gets a sheet, or its look changes |
| [gaps.md](gaps.md) | Backlog: parts without lessons, simplifications and deferrals, vocabulary and skills to revisit, outline issues | coordinator | With every ledger update, and whenever something is skipped on purpose |

## Workflow

1. The coordinator writes or updates the storyline, style guide and briefs **before** a lesson is written.
2. A worker writes one lesson file in `content/dutch-foundations/part-*/` from its brief, the style guide and the relevant ledger excerpt, and runs `lesson.ts check` until it prints `OK`.
3. The coordinator reviews the lesson (Dutch correctness, brief and ledger compliance, volume and features), fixes or returns it, then records it **from the lesson's actual content** in the part's ledger, and updates the topic map and gaps.
4. The main session imports accepted lessons into the explicitly selected database target; production imports require the user's authorization and are recorded in the ledger. Nobody edits the database from these documents.

## Rules

- Briefs never override the ledgers: if a lesson deviates from its brief, the ledger records what it actually teaches and later briefs adapt.
- A topic is `covered` only when an accepted lesson practices it; planned work stays `missing (planned: …)` in the topic map.
- Do not edit `content/dutch-foundations/part-iii/existing/`; record its defects in the ledger instead.
