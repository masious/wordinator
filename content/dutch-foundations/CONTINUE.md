# Continue: Dutch Foundations Part III

You are the **main session**. Your job is to finish Part III of the Dutch Foundations course with as little context noise as possible. Do not write or review lessons yourself. For each batch, spawn **one coordinator agent** (`general-purpose`, foreground). The coordinator spawns the worker and reviewer agents, waits for all of them, and returns a short report. Relay that report to the user and wait for their go-ahead before starting the next batch.

Repo: `/Users/jsninja/myworkspace/2wordinator`. Read `CLAUDE.md` and `content/dutch-foundations/README.md` first. Everything else is listed below; read it only when you need it.

## Where things stand (2026-10-08)

- **Part II (rows 7–12), 12 lessons:** finished. Written, reviewed, with New words. It is in the local DB and in production as a **draft** course with **unpublished** lessons, course ID `cc2bc79f-6a98-4944-81fa-082b17873e62`. The user publishes from the app.
- **Part III (rows 13–18), course ID `b885c80c-9118-4ce7-80e0-03500c8e05d5`:**
  - 13-1 and 13-2 (`part-iii/existing/`) are published locally and in production, with defects fixed.
  - 14-a, 14-b, 15-a, 15-b, 16-a, 16-b and 17-a are reviewed (`part-iii/review/`), have New words, are accepted in the ledger, and are imported locally as drafts at positions 2–8.
  - In production, 14-a, 15-a, 15-b, 16-a, 16-b and 17-a are imported as **unpublished** drafts at positions 2 and 4–8, using `part-iii/course.prod.json`.
  - **14-b is left out of production Part III by the user's decision.** It exists in production only as the standalone one-lesson course "Leggen of zetten?", lesson ID `e2b961ef-9449-4112-8b32-53fd8cec3135`, so production Part III has a gap at position 3. Every production Part III import must strip that ID from the SQL (see below).
  - 17-b, 18-a and 18-b are not written. Their briefs are in `docs/content/briefs-part-iii.md`.

## Part priority (user's order, 2026-10-10)

Work on parts in this order: **Part II → Part III → Part IV → Part V → Part VI → Part VII → Part I last.** Part II is finished; finish Part III (Batch B) next. Parts IV onward need briefs and a ledger before workers start (see `docs/content/index.md#workflow`).

## Agent models (cost)

Use the cheapest model that does the job: coordinator and workers on `sonnet`; reviewers on `opus`, because they are the Dutch-correctness gate.

## Batches (the user's rule: finish a batch completely before starting the next)

- **Batch A:** 16-a, 16-b and 17-a. **Done** (reviewed, docs updated, local and production import).
- **Batch B:** 17-b, 18-a and 18-b: write, review, docs, local import. Wait for the user's go before starting.
- **Then stop** and ask the user whether to import Batch B into production. Never write to production without the user's explicit yes in that turn.

Decisions already made (in `part-iii/REVIEW-NOTES.md`; tell Batch B's coordinator):
- There is no tram anywhere in Sofia's Utrecht. The only tram in the story is tram 2 in Amsterdam. The briefs still mention a Lombok tram; the user wants them left as they are, and the ledger records what the lessons actually do.
- The NS bike-on-train rush hours (weekdays 6:30–9:00 and 16:00–18:30) were checked by the user and are correct.
- Sofia has no bike before Saturday 31 October. She bought a raincoat on Tuesday 3 November (17-a).

A batch is finished when every one of these is true:
1. Each lesson is written per `content/dutch-foundations/tools/WORKER.md`.
2. Each lesson is reviewed per `tools/REVIEWER.md`, which writes `part-iii/review/<NN-x>.md`.
3. `lesson.ts check` prints OK for each lesson.
4. No term repeats an earlier lesson's term, except for a new meaning with a note.
5. The docs are updated. **Main-session job:** imported into the **local** DB.

## Coordinator prompt (give this to each batch's coordinator, with the batch's lesson list)

> You coordinate one batch of Dutch Foundations Part III lessons in `/Users/jsninja/myworkspace/2wordinator`: **<lessons>**. Read `content/dutch-foundations/README.md`, `docs/content/index.md`, `docs/content/style-guide.md` (including "New words"), the relevant briefs in `docs/content/briefs-part-iii.md`, `docs/content/storyline.md`, and `docs/content/ledger-part-iii.md`. Do not read lesson JSON in full yourself; use `python3 content/dutch-foundations/tools/dump.py <file>` only when you must decide something.
>
> 1. **Write** (skip lessons that already exist). Spawn one `general-purpose` worker per lesson, in parallel. Each worker gets a short prompt:
>    - "read `content/dutch-foundations/tools/WORKER.md` and follow it exactly"
>    - its brief name and target file
>    - helper scripts named `*-<NNx>.*`
>    - context: story facts and Lombok geography from the Part III ledger. Lombok has buses and **no tram**. The bakery and supermarket are in the Kanaalstraat, with the bus stop opposite the supermarket. Kastanjestraat 14 is on the corner, opposite a small park; Henk lives on the first floor and Sofia on the second. Sofia has had her bike since 31 October.
>    - "Run `python3 content/dutch-foundations/tools/terms.py content/dutch-foundations/part-iii/*.json content/dutch-foundations/part-iii/existing/*.json` before and again just before finishing; do not repeat earlier terms. Part II words count as known."
>
>    Wait for every worker. Collect each worker's doubts and new story facts in `content/dutch-foundations/part-iii/REVIEW-NOTES.md` under `## <NN-x>`.
> 2. **Decide** the cross-lesson questions yourself (story contradictions, geography, colour convention, what counts as known), so reviewers get decisions, not questions.
> 3. **Review.** Spawn one reviewer per lesson, in parallel. Each gets "read `content/dutch-foundations/tools/REVIEWER.md` and follow it exactly, including item 7 (New words)", its lesson, brief, REVIEW-NOTES section, review-notes path (`part-iii/review/<NN-x>.md`) and your decisions. Wait for every reviewer.
> 4. **Verify.**
>    - `apps/api/node_modules/.bin/tsx content/dutch-foundations/tools/lesson.ts check content/dutch-foundations/part-iii/*.json` must print OK for every file, with player steps at or below 125.
>    - Run `terms.py` across Part III and remove any repeated term from the **later** lesson. Repeats with a new meaning and a note are allowed, as is 14-a/14-b, which is an intentional exception.
> 5. **Docs.**
>    - Mark each lesson `accepted` in `docs/content/ledger-part-iii.md` and append its review file's sections, except "Review changes" and "Open questions", plus a link to the review file, in the same format as the 14-a…15-b entries.
>    - In `docs/content/topic-map.md`, set the lesson's rows to `covered` (or `partial` with a note).
>    - Add skipped or simplified items to `docs/content/gaps.md`, and new fixed story facts to `docs/content/storyline.md`.
> 6. **Rules.**
>    - Never touch any database or run `wrangler`.
>    - Edit only `content/dutch-foundations/part-iii/**` and `docs/content/**`.
>    - Do not hand back while any child agent is still running, because their reports would otherwise go to the main session.
>    - If you hit a limit, report exactly which steps are done.
> 7. **Return at most 25 lines:** a table (lesson, items, steps, words, check, review status), the decisions you made, open questions for the user, and anything not done.

## Main-session steps after each coordinator returns

1. Spot-check with `lesson.ts check` on the batch's files.
2. Import locally from the repo root:

   ```bash
   apps/api/node_modules/.bin/tsx content/dutch-foundations/tools/lesson.ts sql content/dutch-foundations/part-iii > <scratchpad>/part-iii.sql
   ```

   Then, from `apps/api`:

   ```bash
   npx wrangler d1 execute wordinator --local --file=<scratchpad>/part-iii.sql
   ```

   The SQL upserts every Part III lesson file as an unpublished draft at positions 2+, in file-name order, and adds practice anchors. Existing drafts get `draft_version + 1`. Verify with a `select position, title` query.
3. Note the import in `docs/content/ledger-part-iii.md` (the "Local database" line).
4. Report to the user briefly and wait.

## Production import (only after the user's explicit yes in that turn)

From the repo root, generate the SQL with the production manifest and strip 14-b. Without this, its upsert would overwrite 14-b's draft in the standalone course and set its position to 3:

```bash
apps/api/node_modules/.bin/tsx content/dutch-foundations/tools/lesson.ts sql content/dutch-foundations/part-iii course.prod.json | grep -v e2b961ef-9449-4112-8b32-53fd8cec3135 > <scratchpad>/part-iii.prod.sql
```

Check that it has no `e2b961ef` and no local group ID (`6c75c76c`). Then, from `apps/api`, run `npx wrangler d1 execute wordinator --remote --file=<scratchpad>/part-iii.prod.sql`. Verify with a `--remote` `select position, title` query, and update the "Production" line in the ledger.

## Fixed facts and preferences

- **Local vs production:**
  - Local: group `6c75c76c-6f5c-4e2b-a9a6-b77a2dbe89c3`, owner (Masious) `0b622df5-942d-45c6-9e4b-2ebb132c1b32`.
  - Production: group `853d0e7e-b65e-4387-834d-f68ee658d6bf`, owner (Masious) `ff78183b-5ea6-4ac4-99c6-48951802b5df`.
  - Manifests: `course.json` is local; `course.prod.json` is production (`lesson.ts sql <dir> course.prod.json`).
  - Always pass `--local` or `--remote` explicitly.
- **Lesson format:** BlockNote-shaped JSON, validated by the shared contracts. Use every feature: heading levels 1–3, all callout variants across a part, columns, nested and numbered lists, dividers, inline bold/italic/colour/background, at most one link, `imageIdeas` instead of images, and `vocabulary` (New words) blocks.
- **Volume:** heavy practice: at least 7 practice blocks and at least 45 items, including a reading passage. At least 2 dialogues and at least 10 examples. Player steps between 85 and 120 (reviewers may go up to 125).
- **New words:** conventions are in `docs/content/style-guide.md#new-words`. Nouns use the article (`het balkon`, forms `de balkons`). Verbs give the hij-form · past · participle as forms. Each block goes directly after the block that introduces its words. Each term appears once per lesson, and a word belongs to the first lesson that introduces it.
- **Concurrency:** at most 3 child agents running at once per coordinator. Earlier runs of 9 parallel agents hit the usage limit.
- **Story:** Sofia (28, Spanish programmer) in Utrecht, autumn 2026. Cast and timeline are in `docs/content/storyline.md`. Henk has no surname. 18-b closes the Part III arc.
