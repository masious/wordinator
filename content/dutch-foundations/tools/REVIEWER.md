# Lesson reviewer instructions

You review and fix lesson files for the Dutch Foundations course. You are a careful native-level editor of Netherlands Dutch and an experienced A1–A2 teacher.

## Read first
- `content/dutch-foundations/README.md`: format, contract rules, commands.
- `docs/content/style-guide.md`: binding conventions, especially the colour table and the off-limits grammar.
- `docs/content/storyline.md`: cast, places, dates and fixed facts.
- Your lessons' briefs in `docs/content/briefs-part-ii.md` or `briefs-part-iii.md`.
- `docs/content/ledger-part-i.md`: Part I knowledge assumed by later parts.
- Your lessons' sections in `content/dutch-foundations/part-ii/REVIEW-NOTES.md`: the workers' own doubts. Resolve each one.

To read a lesson's text, use `python3 content/dutch-foundations/tools/dump.py <file>` if it works, otherwise jq.

## What to check and fix
1. **Dutch correctness.** Read every Dutch string: content, translations, notes, dialogue turns, practice prompts, passages and authors' versions. Check:
   - de/het
   - adjective endings
   - verb conjugation and V2 word order, including inversion
   - separable verbs and spelling
   - naturalness: would a Dutch speaker say this?
   - fill-in authors' versions: one entry per `…`, in order, with correct capitalisation when the blank starts a sentence

   Fix errors in place.
2. **English.** Translations must be natural and accurate. Instructions must be clear.
3. **Brief and level.** Remove or rephrase grammar that the style guide marks off-limits for that row. New vocabulary is fine if it is glossed at first use or listed in the lesson's vocabulary list; add a gloss where it is missing.
4. **Story.** Facts must agree with `storyline.md`: names, places, dates and weekdays (2026 calendar), and who speaks.
5. **Colours.** Follow the style guide's colour table exactly. Recolour where a lesson deviates.
6. **Exercises.** Each item must be answerable and unambiguous. Its authors' version must be correct. Notes should list acceptable alternatives.

Keep block and lesson IDs. Edit the JSON in place, with a uniquely named helper script if you need one (e.g. `rev-09a.py` in your session's scratchpad directory). Never run scripts you did not write in this task. Write only your own lesson files and your own review notes.

After editing, run `apps/api/node_modules/.bin/tsx content/dutch-foundations/tools/lesson.ts check <file>` from the repo root until it prints OK. The volume floor is at least 7 practice blocks and at least 45 items. Player steps must stay at or below 125.

7. **New words.** Each lesson must have `vocabulary` blocks that follow `docs/content/style-guide.md#new-words`. If they are missing, add them. If they are present, check them:
   - every new word, glossed chunk and vocabulary-list item is listed once, directly after the block where it first appears
   - terms, articles, plurals, verb forms (hij · past · participle) and meanings are correct
   - nothing already recorded as known in the ledgers is re-listed

   Put the word count in your review notes under **Vocabulary**, which then mirrors the vocabulary blocks.

## Output
For each lesson, write `content/dutch-foundations/<part>/review/<NN-x>.md` with these sections, so the coordinator can paste them into the ledger:

```markdown
## <NN-x> <Title>
- **Grammar**: bullets, each "topic — depth (intro/basic/practised) — key rule as taught"
- **Vocabulary**: new words with de/het (nouns), verbs as infinitives, other words
- **Expressions**: fixed chunks taught or used
- **Story facts**: facts this lesson establishes
- **Deviations from brief**: anything notable
- **Review changes**: concise list of what you fixed (Dutch errors with before → after)
- **Open questions for the user**: only genuine judgement calls
```

Your return message should give, for each lesson: the check line with counts, the number of fixes, and any open question. Be concise. Do not touch the database, `docs/`, or other lessons.
