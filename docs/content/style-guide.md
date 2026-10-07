# Dutch Foundations — style guide

Owner: content coordinator. Part of the [content docs](index.md). Binding for every lesson worker, together with [`content/dutch-foundations/README.md`](../../content/dutch-foundations/README.md) (file format, contract rules, commands).


## Lesson skeleton

Every lesson uses this order. Adapt section names to the topic.

1. `heading` level 1: the lesson title (same as the file `title`).
2. Intro `paragraph`: 2–4 short sentences in English: where we are in the story, and "In this lesson you will…".
3. `heading` 2 "Story: …" with the first dialogue.
4. `divider`, then one `heading` 2 per grammar or vocabulary topic, with `heading` 3 subsections, examples, callouts, lists, a `columnList`.
5. A second dialogue later in the lesson, applying the grammar.
6. `divider`, `heading` 2 "Practice", with `heading` 3 per practice block (e.g. "Fill in", "Word order", "Translate into Dutch").
7. `heading` 2 "Reading: …" with the reading-passage practice.
8. `heading` 2 "Your turn" with the free-production practice.
9. `heading` 2 "Summary": a short `numberedListItem` or `bulletListItem` list of the rules.

## Colour convention (inline styles)

Use these consistently across all lessons. Not every role is coloured in every sentence; colour only what the current explanation is about.

| Role | Style |
| --- | --- |
| Subject | `textColor: green` |
| Finite (conjugated) verb | `textColor: blue` |
| Verb part sent to the end (separable prefix, infinitive after a modal or gaan) | `textColor: red` |
| Time expression | `textColor: orange` |
| Place expression / preposition of place | `textColor: purple` |
| Manner expression (met de fiets, samen, lopend) | `textColor: gray` |
| de-word article and de-forms (de, deze, die, adjective -e with de-words) | `textColor: pink` |
| het-word article and het-forms (het, dit, dat, adjective without -e) | `textColor: brown` |
| The new target form of this lesson | `bold`, optionally `backgroundColor: yellow` (at most one yellow highlight per example) |
| A wrong form shown as a mistake | `italic` + `backgroundColor: gray`, always followed by the correct form |
| English glosses inside paragraphs | `italic` |

Paragraph-level `backgroundColor: blue` may mark a "Remember" summary paragraph (at most one per lesson). In every lesson, add one short sentence near the start that explains the colours used in that lesson (e.g. "Verbs are blue, prefixes that move to the end are red.").

## Callouts

One rule per callout, 1–3 short sentences. Icons:

| Variant | Use for | Icon |
| --- | --- | --- |
| `grammar` | One rule, ideally with a formula ("time + verb + subject") | `book-open` |
| `pronunciation` | Sounds, stress, spelling-to-sound | `volume-2` |
| `false-friend` | Words that look like English (or Spanish) but differ | `message-circle-warning` |
| `culture` | Dutch customs, Utrecht facts | `globe` or `map-pin` |
| `hint` | Learning tips, memory tricks | `lightbulb` |
| `warning` | A typical learner mistake: wrong form (gray background, italic) → correct form | `triangle-alert` |
| `important` | A must-remember fact or summary | `star` or `megaphone` |

## Tone and language

- English explanations: friendly, plain, short sentences, no jargon without an example. Use the terms "subject", "verb", "prefix", "infinitive", "de-word", "het-word".
- Dutch: natural Netherlands Dutch, A1 → early A2. Short sentences. Characters speak like real people (Noor informal, Ingrid formal).
- Dialogue speakers: use the character's first name (e.g. "Sofia", "Henk", "Mevrouw Visser" is not used; use "Ingrid"). 6–12 turns per dialogue.
- Examples: Dutch sentence with the target form bold and coloured; translation in natural English; note when it explains or recycles something ("Recycles er is from row 13").
- Practice notes: explain the rule, accept alternatives ("Also fine: …"), or flag a typical mistake. Write a note for every item where a rule applies. Notes are plain text.
- Fill-in prompts: use `…` only for blanks. If a base form must be given, put it in brackets after the sentence: "Wij … om zeven uur op. (opstaan)". Authors' versions contain only the missing words, capitalised as they would appear in the sentence.
- Word-order items: "Put in order: morgen / ik / ga / naar de markt". Separate chunks with " / ". Authors' version is the full sentence with capital and full stop.
- Translations into English in notes and authors' versions use natural English.
- No past tense anywhere (see off-limits). Plan the story so everything is said in the present.
- No gamification words (points, score, streak, badge, level up, win). No images in blocks; use `imageIdeas`.

## Global off-limits for Parts II–III (later in the outline)

Never use these, not even in dialogues or reading passages, unless listed as an allowed chunk:

- **Past tenses**: perfect (`heb gedaan`, `ben gegaan`) and simple past (`was`, `had`, `ging`). Rows 25–29. Includes "Hoe was het?", "Dat was het", "gisteren" sentences.
- **Subordinate clauses**: `dat`, `omdat`, `als` (if/when), `wanneer` as conjunction, `of` meaning "whether", `toen`, `terwijl`, indirect questions ("Weet u waar het station is?"). Rows 24, 30, 31. Use main clauses joined with `en`, `maar`, `of` (or) only.
- **want** (row 31) and relative clauses with `die/dat` (row 33).
- **om … te**, **te + infinitive** (row 34).
- **zullen**, "Zullen we…?" (row 21); **moeten**, **hoeven** (rows 20, 23); **zou/zouden** (rows 35, 37).
- **aan het + infinitive** (row 22).
- **houden van**, **graag** as "like to" (row 19). Allowed chunks: "Ik wil graag …", "Ja, graag.", "Graag gedaan.".
- **Superlatives** (row 32). Comparatives only from 18-b.
- **Reflexive verbs** (row 38): no "zich aankleden", "zich voelen", "zich haasten".
- **Object pronouns** as a system (row 37). Allowed chunks only: "Dank je / Dank u", "Kunt u mij helpen?" (from 15-a), "Doe mij maar …" (from 11-a), "Die jas staat je goed" (18-b), "Tot ziens", "Ik zie je morgen" (allowed from 07-a as a chunk), "Bel me!" (from 15-b). Prefer demonstratives (deze, die) for "it/that one" from 12-a.
- Any grammar from a later row of Parts II–III before its lesson. Each brief lists the specific limits.

Allowed everywhere: `en`, `maar`, `of` (or), `ook`, `wel`, `niet`/`geen` at Part I level, `heel`, `erg`, `een beetje`, `samen`, `ook`, numbers, `er is/er zijn` only from Part III (row 13 onwards; Part II lessons avoid them), "Alsjeblieft/alstublieft", "Dank je wel", "Sorry", "Pardon", "Gezellig!", "Lekker!". From 08-b onwards also `dan`, `daarna`, `dus` at the start of a sentence (with inversion).

Imperatives before 15-b: only these fixed chunks: "Kijk!", "Wacht even!", "Kom binnen!", "Ga zitten.", "Zeg maar Henk / jij." (12-b onwards), "Doe maar …" (11-a onwards), "Eet smakelijk!" (not imperative grammatically but fine).

## Practice plan template

Every lesson: **at least 7 practice blocks and 45 items**, all with authors' versions. Recommended 8 blocks:

| # | Type | Items |
| --- | --- | --- |
| P1 | Fill-in, single blank (form drill) | 7–8 |
| P2 | Fill-in, multi-blank or dialogue completion (the prompt is a 2–3 line exchange, "Sofia: … / Noor: …", several blanks) | 5–6 |
| P3 | Word order / sentence building ("Put in order: …") | 6–7 |
| P4 | Transformation (rule-based rewrite, as specified per brief) | 6–7 |
| P5 | Translate into Dutch (EN→NL) | 6–7 |
| P6 | Translate into English (NL→EN) | 5–6 |
| P7 | Reading passage in the storyline, at least 6 questions (in Dutch, answered in Dutch; one or two may be true/false "Klopt dit? …") | 6–8 |
| P8 | Free production: 1 item, "Write 3–4 sentences about your …"; authors' version is a model answer by Sofia or a neutral model | 1 |

Practice items may stand inside the relevant grammar section (e.g. a short P1 right after the rule) or all in the Practice section; keep instructions explicit about the task.

## Feature checklist (every lesson)

- One h1, several h2, several h3.
- ≥ 2 dialogues (6–12 turns each, story characters), ≥ 10 examples with translations.
- ≥ 4 callout variants (the brief lists the required ones), fitting icons.
- ≥ 1 `columnList` (2–3 columns): conjugation table, comparison, Dutch vs English.
- ≥ 1 nested bullet list; ≥ 1 numbered list (procedure or rules); dividers between major sections.
- Inline bold, italic, textColor, backgroundColor per the colour convention.
- At most 1 link (stable reputable site: https://woordenlijst.org, https://www.ns.nl, https://www.knmi.nl). Optional.
- `imageIdeas`: 1–3, each with `afterHeading` matching an existing heading text exactly.
- ≤ 200 blocks, < 256 KB, `player.steps` 70–130 (aim 85–115).



## Worker requirements (every lesson)

These are pasted into every worker brief.

- **Volume**: at least 7 practice blocks and at least 45 practice items, all with authors' versions, and notes wherever there is a rule, an alternative answer or a typical mistake. Mix: fill-in (including multi-blank and dialogue-completion fill-ins); EN→NL translation; NL→EN translation; word order / sentence building; transformation; a reading passage with at least 6 questions set in the storyline; one free-production item.
- **Dialogues and examples**: at least 2 dialogues (6–12 turns each, story characters as speakers) and at least 10 examples with translations, with notes where useful.
- **Features**: heading levels 1–3 (one h1, h2 sections, h3 subsections); at least 4 different callout variants with fitting icons (the brief lists the required ones); at least one `columnList`; at least one nested bullet list; a numbered list; dividers between major sections; inline bold, italic, `textColor` and `backgroundColor` by the colour convention; at most one link; 1–3 `imageIdeas`.
- **Limits**: at most 200 blocks, under 256 KB, `player.steps` about 70–130.
- **Done** = `apps/api/node_modules/.bin/tsx content/dutch-foundations/tools/lesson.ts check <file>` prints `OK` and the counts meet the above.
- Workers write only their own lesson file. They do not touch the database, other lessons, or anything under `docs/`, and never run the `sql` command or `wrangler`.

## Provisional language decisions

Defaults chosen by the coordinator while the user has not decided. Follow them; the user may overturn them later (then update affected lessons).

- **jullie + verb**: teach *jullie werken*; treat *jullie werkt* as an error in practice notes.
- **kunnen with jij**: teach *kun je / kun jij* first; note that *kan je* is common in speech.
- **heel before an inflected adjective**: *een heel koude dag* in writing; note that *een hele koude dag* is common in speech.
- **Plates in a cupboard**: *De borden staan in de kast.*
- **Mid-sentence dus**: avoid ", dus …" in Parts II–III; start a new sentence with *Dus* + inversion instead.
- **Incidental vocabulary**: short unglossed interjections (Oei, Joh, hè, toch?, Nee hoor, Ja hoor, Wat leuk!) are allowed; any other new content word must be glossed on first use and is recorded in the ledger.
