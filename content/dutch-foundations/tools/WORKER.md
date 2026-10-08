# Lesson worker instructions

You write one lesson file for the Dutch Foundations course in the Wordinator app (repo `/Users/jsninja/myworkspace/2wordinator`). You are an experienced A1–A2 Dutch teacher and a native-level writer of Netherlands Dutch.

## Read first (binding)
1. `content/dutch-foundations/README.md`: the file format, contract rules and commands.
2. `content/dutch-foundations/tools/sample-lesson.json`: every supported feature in the authoring shorthand.
3. `docs/content/style-guide.md`: lesson skeleton, colour table, callouts, tone, off-limits grammar, practice plan, feature checklist and **worker requirements**. Follow it exactly.
4. `docs/content/storyline.md`: cast, places, dates and fixed facts. Never contradict it.
5. Your brief, in the briefs file named in your task.
6. What learners already know:
   - `docs/content/ledger-part-i.md`
   - `docs/content/ledger-part-ii.md`
   - `docs/content/ledger-part-iii.md`

   Recycle this material on purpose, and do not re-teach it as new.
7. One finished lesson as a model of depth and structure: `content/dutch-foundations/part-ii/12-b-wat-kost-dat.json`. Read it with `python3 content/dutch-foundations/tools/dump.py <file>`.

## Requirements
- **Volume:** at least 7 practice blocks and at least 45 items. Every item has an authors' version. Add notes for rules, alternative answers and typical mistakes. Use the exercise mix from the style guide:
  - fill-in, including multi-blank and dialogue completion
  - EN→NL and NL→EN translation
  - word order
  - transformation
  - a reading passage with at least 6 questions, set in the storyline
  - one free-production item
- **Dialogues and examples:** at least 2 dialogues of 6–12 turns, with story characters as speakers, and at least 10 examples.
- **Features:**
  - headings at levels 1–3
  - at least 4 callout variants, including the ones the brief requires
  - at least one `columnList`
  - a nested bullet list and a numbered list
  - dividers
  - inline bold, italic, `textColor` and `backgroundColor`, following the colour table
  - at most one link
  - 1–3 `imageIdeas`
- **New words:** `vocabulary` blocks that follow `docs/content/style-guide.md#new-words`. Each lesson needs 15–35 words, each placed directly after the block where it first appears.
- **Limits:** player steps between 85 and 120.
- **Done** means `apps/api/node_modules/.bin/tsx content/dutch-foundations/tools/lesson.ts check <your file>`, run from the repo root, prints `OK` with counts that meet the above.

## Rules
- Write **only** your own lesson file. If you use a helper script, give it a name unique to your lesson, e.g. `gen-15a.py`, in your session's scratchpad directory. Never run a script you did not write in this task.
- Do not touch the database, `wrangler`, `docs/`, other lessons, or the `sql` command.
- No images in blocks; use `imageIdeas`. No gamification wording.

## Return message (concise)
- The final `check` output line with counts.
- A 5–8 line summary of the contents.
- Dutch points you were unsure about.
- Deviations from the brief.
- New story facts you established.
