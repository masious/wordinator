# Course content documentation

Curriculum, storyline and coverage tracking for the member-authored **Dutch Foundations** courses. The lesson files themselves, the validator and the import manifests live in [`content/dutch-foundations/`](../../content/dutch-foundations/README.md); how lessons render and play is owned by [courses.md](../courses.md). These documents own *what* is taught, *in which order*, *in which story*, and *what is still missing*.

The 40-row curriculum is [`content/dutch-foundations/outline.md`](../../content/dutch-foundations/outline.md) (owned by the user). Current state: Part I is assumed knowledge (no lessons), Parts II and III are being written, Parts IV–VII are not started. Writing order (user's priority): Part II → Part III → Part IV → V → VI → VII, and Part I last.

## Documents

| Document | Owns | Updated by | When |
| --- | --- | --- | --- |
| [storyline.md](storyline.md) | Setting, cast, timeline, lesson-by-lesson story beats, fixed story facts | coordinator | Before workers start; when an accepted lesson establishes a new story fact |
| [style-guide.md](style-guide.md) | Lesson skeleton, colour convention, callout use, tone, global off-limits grammar, practice template, feature checklist, worker requirements | coordinator | When a convention changes (then check existing lessons) |
| [briefs-part-ii.md](briefs-part-ii.md) | Per-lesson briefs for Part II (rows 7–12): scope, grammar facts, vocabulary, recycling, off-limits, practice plan | coordinator | Before a lesson is written; briefs are the plan, not the record |
| [briefs-part-iii.md](briefs-part-iii.md) | Per-lesson briefs for Part III (rows 14–18) | coordinator | As above |
| [ledger-part-i.md](ledger-part-i.md) | Part I knowledge assumed by later parts (no lessons exist) | coordinator | When a Part I course is written or assumptions change |
| [ledger-part-ii.md](ledger-part-ii.md) | What each Part II lesson actually teaches: grammar with depth, vocabulary with de/het, expressions, story facts, deviations | coordinator | After each lesson is reviewed and accepted, from the lesson file |
| [ledger-part-iii.md](ledger-part-iii.md) | Same for Part III, including the two existing row-13 lessons | coordinator | As above |
| [topic-map.md](topic-map.md) | Cross-part map of every grammar topic: where introduced, where reinforced, status (`covered`/`partial`/`assumed`/`deferred`/`missing`) | coordinator | With every ledger update |
| [illustrations.md](illustrations.md) | Visual canon (style, how characters and places look), reference sheets, the `imageIdeas` generation fields and the `illustrate.ts` workflow | coordinator | When a character or place gets a sheet, or its look changes |
| [gaps.md](gaps.md) | Backlog: parts without lessons, simplifications and deferrals, vocabulary and skills to revisit, outline issues | coordinator | With every ledger update, and whenever something is skipped on purpose |

## Workflow

1. The coordinator writes or updates the storyline, style guide and briefs **before** a lesson is written.
2. A worker writes one lesson file in `content/dutch-foundations/part-*/` from its brief, the style guide and the relevant ledger excerpt, and runs `lesson.ts check` until it prints `OK`.
3. The coordinator reviews the lesson (Dutch correctness, brief and ledger compliance, volume and features), fixes or returns it, then records it **from the lesson's actual content** in the part's ledger, and updates the topic map and gaps.
4. The main session imports accepted lessons into the local database. Nobody edits the database from these documents.

## Rules

- Briefs never override the ledgers: if a lesson deviates from its brief, the ledger records what it actually teaches and later briefs adapt.
- A topic is `covered` only when an accepted lesson practises it; planned work stays `missing (planned: …)` in the topic map.
- Do not edit `content/dutch-foundations/part-iii/existing/`; record its defects in the ledger instead.
