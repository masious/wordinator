# Word marks — annotator instructions

You mark every place a lesson's **new words** are used in that lesson's own text. The app tints each marked use and opens the word's card on click (`docs/courses.md#word-marks`). Marks are stored data, so precision matters more than speed: a wrong mark teaches a wrong word.

## Workflow (run from the repository root)

1. `apps/api/node_modules/.bin/tsx content/dutch-foundations/tools/word-marks.ts dump <lesson.json>` prints the lesson's new words (`id | term | forms | meaning`) and every markable text. Each text starts with `### <blockId> <field> (<block type>)`, and every token is followed by `⟨index⟩` plus its formatting (`b` bold, `i` italic, a colour name, `bg:<colour>` background).
2. Write `content/dutch-foundations/word-marks/<same file name as the lesson>.json`:
   ```json
   { "marks": [
     { "blockId": "…", "field": "content", "word": "<word id>", "tokens": [1], "color": "blue" },
     { "blockId": "…", "field": "turn:3", "word": "<word id>", "tokens": [1, 5], "color": null }
   ] }
   ```
   One object per use. `tokens` are the `⟨index⟩` numbers of that text. Adjacent indices become one highlighted part; a gap makes a split mark (`sta⟨1⟩ … op⟨5⟩` → `[1, 5]`).
3. `apps/api/node_modules/.bin/tsx content/dutch-foundations/tools/word-marks.ts check <lesson.json>` and fix every `PROBLEM`. Then go through **every** line of `unmarked exact uses`: each one is either a use you missed (add it) or a deliberate skip (English, a mistake, a name — see below). Run `check` again until it prints no problems.

Never edit lesson files, tools, or anything outside `content/dutch-foundations/word-marks/`.

## What to mark

- **Every Dutch use of a new word, in any form**, in any text: headings, paragraphs, list items, callouts, examples and their notes, dialogue turns, word-card examples and notes (`word:<id>:example|note`), reading passages. Inflections count: `komen` → kom, komt, kwam, kwamen, gekomen; `groot` → grote, groter, grootste; `huis` → huizen. Irregular forms count (`zijn` → ben, is, was, waren).
- **Talk about the word counts too**: "the verb **komen**", "say **uit**, never van" — mark `komen` and `uit`.
- **Separable and split words**: mark the verb and its particle as one split mark (`Ik sta⟨1⟩ om zeven uur op⟨5⟩` → `[1, 5]`; `op⟨3⟩ te staan⟨5⟩` → `[3, 5]`, leaving out `te`). A joined form is one token (`opgestaan`, `opstaan`).
- **Multi-word new words** (`Waar kom je vandaan?`, `houden van`, `tv kijken`, `naar huis gaan`, `tot morgen`): mark all their tokens; a gap is fine when the sentence splits them (`Ik hou⟨1⟩ echt van⟨3⟩ koffie` → `[1, 3]`). Leave out articles and `zich` unless the word itself starts with them inside a fixed phrase.
- **Nouns**: mark the noun only, not its article (`de⟨4⟩ collega⟨5⟩` → `[5]`). Plurals and diminutives listed in `forms` count.
- **Overlap**: a token belongs to at most one mark. When a phrase word and a single word both fit, mark the **longer phrase** (in `Waar kom je vandaan?`, mark the phrase, not `waar` and `kom` separately).

## Decisions (2026-10-30, these override anything above)

- **Very common words** that a lesson teaches as new (articles `de`, `het`, `een`; personal and possessive pronouns; `hebben`, `zijn`, `worden`; short prepositions and conjunctions such as `in`, `uit`, `op`, `met`, `en`, `maar`, `of`) are marked **only** in example sentences (`example` blocks' `content`), dialogue turns (`turn:*`), and the words' own card examples (`word:<id>:example`). Not in headings, paragraphs, list items, callouts, notes, or passages.
- **One meaning:** mark a word only where it has the meaning this lesson teaches (its `meaning` in the word list). `werken` taught as "to function" is not marked in "Ik werk vrijdag"; `voor` taught as "in front of" is not marked where it means "for".
- **Sentence and phrase words** (`Hoe oud ben je?`, `We zijn naar het centrum gegaan.`, `Kom je kijken?`): mark only exact copies (same words in the same order; punctuation, capitals, and a gap the sentence itself splits do not matter). A variant with another pronoun, person, or word ("Hoe oud ben jij?", "Lotte komt kijken") is not marked as the phrase; its tokens may still be marked as other new words they are. This applies to sentence and question chunks only. **Verb expressions** whose term is an infinitive phrase (`buiten spelen`, `om uitleg vragen`, `tv kijken`, `de telefoon wegleggen`, `naar huis gaan`) still inflect like verbs, split or reordered as the sentence needs, and a determiner may differ (`speelde … buiten`, `vraagt … om uitleg`, `leg mijn telefoon weg` are marks).
- **Translation fields** (`translation`, `turnTranslation:*`) are English and are never marked.
- **Colour:** the use's own colour in the lesson text when it has one and it is a legend colour; otherwise the legend colour of the role it plays; otherwise `null` (primary).

## What not to mark

- **English.** Explanations are English with Dutch inside, often unformatted. `in`, `is`, `was`, `met`, `letter`, `alleen`… mark only when the token is Dutch in that sentence. "In this lesson" is English; "Ik woon in Utrecht" is Dutch.
- **Deliberate mistakes**: wrong sentences shown as errors (usually `bg:` background colour, often before `→`, in warning or false-friend callouts): `Ik komt uit Spanje. → Ik kom uit Spanje.` — skip the wrong side, mark the corrected side.
- **Different words that only look alike**: compounds and derivations are other words (`zwembad` is not `zwemmen`, `fietser` is not `fietsen`, `meteen` is not `met`, `Daan` is not `daar`). Names are never marks unless the name itself is a new word (`Spanje`, `België`).
- **Words of earlier lessons**: only this lesson's new words exist here; anything else is never marked.
- English translation fields (`translation`, `turnTranslation:*`) are English: normally nothing to mark there.

## Colour

Many lessons state a colour legend ("Colours in this lesson: **subjects** are green, **verbs** are blue, place words are purple") and colour tokens accordingly; the dump shows each token's colour. For each mark:

- If the legend gives a colour for the **role this use plays in its sentence**, set `color` to that palette name (`gray, brown, red, orange, yellow, green, blue, purple, pink`). The token's own colour in the dump is the strongest hint; use it when it matches the legend. Uses outside example sentences (a verb mentioned in a paragraph) take the legend colour of their role too.
- If no legend category fits, or the lesson has no legend, set `"color": null` (the app's primary colour).
- Never invent a colour that is not in the lesson's legend.

## Report

When done, report for each lesson: the mark count, the words never marked and why (truly not in the text, or only in English), and anything you were unsure about.
