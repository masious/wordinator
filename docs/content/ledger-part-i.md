# Ledger — Part I (First Dutch)

Owner: content coordinator. Part of the [content docs](index.md).

Part I (outline rows 1–6) is **being written** (plan: [briefs-part-i.md](briefs-part-i.md)). Parts II–IV were written first and assume the knowledge listed under [Target](#target-what-part-i-must-teach), so that list is Part I's **target**: every item must be taught by some Part I lesson, at least to the depth given. Until a lesson is accepted, its items stay assumed knowledge for later parts.

Once a lesson is reviewed and accepted, its section is recorded below the target **from the lesson's actual content** (same format as [ledger-part-ii.md](ledger-part-ii.md)), and any deviation from the target is noted there and in [gaps.md](gaps.md).

Course: "Dutch Foundations — Part I: First Dutch" (`content/dutch-foundations/part-i/`). Rows 1–6, two lessons per row.

**The course does not exist yet.** The user must create the Part I course in the app and give its ID; the coordinator then writes `part-i/course.json` (and `course.prod.json` for production). Until then no lesson can be imported.

Local database: not imported; the Part I course does not exist locally yet (no `part-i/course.json`).

Production (2026-10-12): 01-a imported as an unpublished draft at position 0 (8 practice anchors); it is published there. 01-b imported 2026-10-12 as an unpublished draft at position 1 (8 practice anchors). Course "Dutch Foundations — Part I: First Dutch" (slug `dutch-foundations-part-i-first-dutch`, ID `b7eb68d8-4fcc-4b13-b2ef-e6f87008cb68`, draft) exists; manifest `part-i/course.prod.json`.

| File | Title | Status |
| --- | --- | --- |
| 01-a-hallo.json | Hallo! Hoe gaat het? | accepted |
| 01-b-wie-ben-jij.json | Wie ben jij? | accepted |
| 02-a-waar-kom-je-vandaan.json | Waar kom je vandaan? | planned |
| 02-b-ik-woon-in-utrecht.json | Ik woon in Utrecht | planned |
| 03-a-spreek-je-nederlands.json | Spreek je Nederlands? | planned |
| 03-b-werk-jij-hier.json | Werk jij hier? | planned |
| 04-a-hoe-oud-ben-je.json | Hoe oud ben je? | planned |
| 04-b-heb-jij-een-fiets.json | Heb jij een fiets? | planned |
| 05-a-mijn-familie.json | Mijn familie | planned |
| 05-b-de-of-het.json | De of het? | planned |
| 06-a-utrecht-is-mooi.json | Utrecht is mooi | planned |
| 06-b-een-mooie-stad.json | Een mooie stad | planned |

Status values: `planned` (brief only), `in review`, `accepted`.

Depth key: **intro** = met once with simple examples; **basic** = rule stated and practiced in simple sentences; **solid** = practiced in several contexts and mistakes addressed.

## Target: what Part I must teach

What Parts II–IV assume. The "Planned in" column is the plan from the briefs; replace it with the accepted lesson once recorded.

### Grammar

| Row | Topic | Target depth | Details | Planned in |
| --- | --- | --- | --- | --- |
| 1 | **zijn** | solid | ik ben, jij/je bent, u bent, hij/zij/het is, wij/we zijn, jullie zijn, zij/ze zijn | 01-a (singular ik/jij/u/hij/zij, **accepted**), 01-b (full table incl. wij/jullie/zij/het; **accepted**) — full zijn table now taught |
| 1 | Subject pronouns | solid | ik, jij/je, u, hij, zij/ze, het, wij/we, jullie, zij/ze; stressed vs unstressed forms; u = formal | 01-a (ik, jij/je, u, hij, zij/ze; **accepted**), 01-b (het, wij/we, jullie, zij/ze "they"; **accepted**) — all subject pronouns now taught |
| 1 | Basic word order | basic | Subject – verb – rest (SVO) in simple statements | 01-a (statements; **accepted**), 01-b (statements with a name → pronoun; **accepted**); 03-b |
| 2 | **komen**, **wonen** | basic | "Ik kom uit Spanje." "Waar kom je vandaan?" "Ik woon in Utrecht." | 02-a, 02-b |
| 2–3 | Present tense, **singular** | basic | ik + stem, jij/u/hij + stem + t; spelling of the stem (maken → ik maak, zitten → ik zit, leven → ik leef, reizen → ik reis); stems ending in -t take no extra t (ik zit, hij zit) | 02-b (rule, spelling), 03-a |
| 3 | **spreken**, languages | basic | "Ik spreek Spaans en een beetje Nederlands." | 03-a |
| 3 | Verb position | basic | Finite verb in second position in statements; verb first in yes/no questions; question word + verb + subject; **jij-inversion t-drop** ("Woon jij …?", "Spreek je …?") | 03-b (02-a: t-drop as a fact; 01-b, **accepted**: yes/no inversion and jij t-drop taught for zijn only — "Bent u …?", "Ben jij …?" — as a fact for zijn, generalised to every verb in 03-b) |
| 4 | **hebben** (singular) | basic | ik heb, jij hebt, u hebt/heeft, hij heeft. (Plural "wij hebben" is taught in 07-a.) | 04-b |
| 4 | Numbers | basic | 0–100, age ("Ik ben 28 jaar."), phone numbers. Larger numbers (hundreds, years) are taught when needed (09-a years, 12-b prices). | 04-a |
| 4 | Question words | basic | wie, wat, waar, waar … vandaan, hoe, hoe oud, hoeveel. (wanneer and hoe laat are taught in 07-b/08-a.) | 04-b (wie, waar, hoe met as chunks from 01-a on) |
| 5 | Possessives | basic | mijn, jouw/je, uw, zijn, haar. (ons/onze, jullie, hun are taught in 07-a.) | 05-a |
| 5 | **de/het** introduction | basic | Two genders; de for most people words and all plurals; het for diminutives (rule given as fact only); learn each noun with its article | 05-b |
| 6 | Adjectives | basic | Predicative without ending ("Het huis is groot."); attributive basics: -e after de/het ("de grote stad", "het grote huis") and with de-words after een ("een grote stad"); no -e with een + het-word ("een groot huis"). Full system incl. spelling changes is 18-a. | 06-a (predicative), 06-b (attributive) |
| — | Negation | basic | **niet** at the end of simple sentences and before adjectives ("Het is niet groot."); **geen** + noun ("Ik heb geen auto."). Not in the outline as a row; assumed. | 03-b (niet), 04-b (geen) |
| — | Conjunctions | basic | en, maar, of (or) | 03-a |
| — | Professions | basic | No article: "Ik ben programmeur." | 01-b (**accepted**) |

Planned beyond the target (record if the lessons teach them): niet before a place ("Ik woon niet in Amsterdam.", 03-b); the alphabet and spelling a name (04-a); greetings by register and u → jij ("Zeg maar jij.", 01-a/01-b) — 01-a (accepted) covers register (informal/formal pairs, u vs jij) but not the switch itself: the "Zeg maar jij" hint was removed from 01-a, so u → jij is taught entirely in 01-b (**accepted**: "Zeg maar jij, hoor. En zeg maar Karin.", with a culture callout on jij and first names at Dutch workplaces); "Dit is …" as a chunk for introducing people, taught in 01-b (**accepted**, restricted to people only; demonstratives stay 12-a).

### Vocabulary and expressions

- **Greetings**: hallo, hoi, dag, goedemorgen, goedemiddag, goedenavond, tot ziens, doei, tot straks, tot morgen. "Hoe gaat het?" "Goed, dank je." "Met mij gaat het goed." "En met jou?" "Aangenaam." "Ik heet …", "Mijn naam is …", "Wie ben jij?"
- **Politeness**: alsjeblieft, alstublieft (please), dank je (wel), dank u (wel), sorry, pardon, ja, nee.
- **Countries, languages, nationalities**: Nederland, Spanje, Engeland, Duitsland, België …; Nederlands, Spaans, Engels, Duits; Nederlander/Nederlandse, Spanjaard/Spaanse.
- **Numbers** 0–100.
- **Family and people**: de man, de vrouw, het kind (kinderen), de moeder, de vader, de ouders, de broer, de zus, de zoon, de dochter, de vriend, de vriendin, de collega, de buurman, de buurvrouw, de familie.
- **Common adjectives**: groot, klein, oud, jong, nieuw, mooi, lelijk, leuk, aardig, lief, lang, kort, goed, slecht, druk, rustig, blij, moe, Nederlands, Spaans.
- **Basic nouns**: het huis, de stad, het land, de straat, de auto, de telefoon, het nummer, het werk, de school, de taal, de naam, de leeftijd, het jaar.
- **Common verbs (singular forms)**: zijn, hebben, komen, wonen, spreken, werken, heten, leren, studeren, lezen, schrijven, drinken, eten.

### Story

Part I is the arrival week, di 1 – zo 6 september 2026 (see [storyline.md](storyline.md#part-i-the-arrival-week)). Its story facts are recorded per lesson below once accepted.

## Lessons (accepted)

## 01-a Hallo! Hoe gaat het? (accepted 2026-10-12)
- **Grammar**:
  - **zijn, singular** — basic — ik ben, jij/je bent, u bent, hij/zij/ze is; a name works like hij/zij (Noor is moe); u takes the jij form (bent). Taught in a grammar callout and a Pronoun | zijn | Example columnList (each pronoun glossed, each example translated), not as New-words cards (coordinator decision).
  - **Subject pronouns ik, jij/je, u, hij, zij/ze** — intro — je unstressed and normal, jij stressed for contrast (En jij?), u formal (strangers, older people, counters).
  - **Word order, first look** — basic — subject + verb + rest (Ik ben moe.); question word first in Hoe gaat het?
  - **Register** — basic — informal vs formal pairs (hoi/goedemorgen, doei/tot ziens, dank je/dank u, met jou/met u); older people say je to younger people, who keep saying u.
- **Vocabulary** (44 words in 9 blocks): hoi, Welkom (in …)!, dank je (wel), dank u (wel), Hoe gaat het?, goed, een beetje, moe, en, En met jou?, Met mij gaat het goed., heel, het station, groot, ja; hallo, dag, goedemorgen, goedemiddag, goedenavond; doei, tot ziens, tot straks, tot morgen, welterusten, Slaap lekker!; Hoe gaat het met jou?, Hoe gaat het met u?, prima, Het gaat wel., Niet zo goed., nee; de vriendin; Ik heet …, Hoe heet je?, Wie ben jij?, Mijn naam is …; Aangenaam.; de buurvrouw; op Schiphol, Nederland, straks, Super!, Klopt dit?. Not cards (taught in the grammar section): zijn, ik, jij/je, u, hij, zij/ze.
- **Expressions**: Hoe gaat het (met jou/u)?, En met jou/u?, En jij?, Met mij gaat het goed., Het gaat wel., Niet zo goed., Goed, dank je/u., Dank je/u wel., Welkom in Utrecht/Nederland!, Aangenaam., Ik heet …, Mijn naam is …, Hoe heet je/u?, Wie ben jij?, Tot ziens/straks/morgen!, Slaap lekker!, Welterusten!, op Schiphol / op Utrecht Centraal, Super!, Klopt dit?
- **Story facts**: di 1 september Sofia flies to Schiphol, messages Noor, takes the train; Noor meets her at Utrecht Centraal late morning; Sofia is a bit tired. In the afternoon at the front door of Noor's flat they meet Els, "de buurvrouw"; Noor and Sofia say u to her, Els says je to them; Noor calls her Els (first name + u). Sofia starts her job the next day.
- **Deviations from brief**:
  - 44 New words, above the "01-a may reach 40" allowance: the worker's 39 omitted the reading passage's glossed words (op Schiphol, Nederland, straks, Super!) and Klopt dit?, which item 7 requires as cards.
  - Pronouns and zijn not on New-words cards (accepted by the coordinator).
  - Reading questions are in English (the brief allows this for rows 1–2); the brief's Dutch "Waar is …?" would use untaught waar.
  - P8 model answer uses a buurvrouw "Anna" instead of the brief's buurman "Peter", and no "Wie bent u?", so it needs no new word and no ben/bent inversion.
  - Dialogue 2 has 11 turns, bound by the brief (accepted).
- **Check**: OK, player.steps=91, practice=8 blocks, practice.items=39, vocabulary.words=44.
- **Review log**: [01-a.md](../../content/dutch-foundations/part-i/review/01-a.md)

## 01-b Wie ben jij? (accepted 2026-10-12)
- **Grammar**:
  - zijn, full table — practiced — ik ben, jij/je bent, u bent, hij/zij/ze/het is, wij/we zijn, jullie zijn, zij/ze zijn; two names or a name + ik are plural (Karin en Daan zijn aardig. Daan en ik zijn een team.). Taught in a grammar callout and a Pronoun | zijn | Example columnList, not as New-words cards (01-a precedent, coordinator decision).
  - Subject pronouns wij/we, jullie, zij/ze (they), het (it) — basic — long forms stressed for contrast, short forms normal; ze is = she, ze zijn = they (important callout); het = it as in Hoe gaat het?, never for people; jullie = you (plural, informal).
  - Statement word order — basic — subject + verb + rest; a name can be replaced by a pronoun (Karin is teamleider. → Ze is teamleider.).
  - Yes/no questions with zijn — basic — verb first, then subject (Bent u …? Is het team …? Zijn jullie …?); with jij/je bent loses its t (Ben jij Daan?), as a fact for zijn only; short answers Ja. / Ja, dat ben ik. / Nee hoor.
  - Jobs without an article — basic — Ik ben programmeur, not *Ik ben een programmeur* (warning callout).
  - Introducing — intro — Dit is … as a chunk for people only.
  - u → jij — intro — Zeg maar jij. / Zeg maar + first name; jij and first names are normal at Dutch workplaces, also with the boss (culture callout).
- **Vocabulary** (31 words in 7 blocks): de teamleider, mevrouw, Ja, dat ben ik., Een moment, alstublieft., Zeg maar jij., hoor, Zeg maar + name, oké, het team, Welkom in het team!, nerveus, Kijk!, Dit is …; de programmeur, nieuw, klein, aardig, blij; Nee hoor; wie; ook, hier; het bedrijf, het IT-bedrijf, de receptie, meneer; Hoi allemaal, maar, gezellig, Dank jullie wel!, Groetjes. Not cards (taught in the grammar section): wij/we, jullie, zij/ze (they), het (it), plural zijn.
- **Expressions**: Ja, dat ben ik., Een moment, alstublieft., Zeg maar jij(, hoor)., Zeg maar Karin., Welkom in het team!, Kijk, dit is Daan., Nee hoor, Wij zijn blij met jou., Hoi allemaal!, Dank jullie wel!, Groetjes, Karin; recycled from 01-a: Goedemorgen, Aangenaam., Hoe gaat het?, Goed, dank je., een beetje, heel, Welkom, Wie ben jij?
- **Story facts**: wo 2 september, morning: Sofia's first day at a small IT company near Utrecht Centraal. A Receptioniste (u) welcomes her. Karin Smit, teamleider, introduces herself; Sofia says "mevrouw Smit" and u; Karin answers "Zeg maar jij, hoor. En zeg maar Karin." Sofia is a bit nervous. Karin introduces Daan, also a programmeur. The team is small: Karin, Daan and Sofia. Daan asks whether Sofia is new in Utrecht (she is). That afternoon Karin welcomes Sofia in the team chat; Daan calls the team small but very gezellig. Henk does not appear.
- **Deviations from brief**:
  - Plural pronouns and zijn taught via grammar callout/table, not New-words cards (coordinator decision).
  - 41 practice items (aim 30–38) and 94 player steps (aim 70–90, limit 110); accepted under "repetition is welcome".
  - Reading passage: Karin's "Groetjes, Karin" moved to the end of her own first message instead of a separate final chat line (a lone sign-off after other people's replies reads oddly).
  - P2 item 1: Sofia asks "Bent u mevrouw Smit?" instead of Karin asking "Bent u Sofia?" (Karin uses jij with everyone).
  - P5 has 5 items (the brief's "You can say jij." and "Are you (plural) tired?" are practiced elsewhere: P6, P3).
  - Extra card "Dank jullie wel!" (in the brief's passage, not in its vocabulary list).
- **Check**: OK, player.steps=94, practice=8 blocks, practice.items=41, vocabulary.words=31. No 01-a New-words term repeated (terms.py).
- **Review log**: [01-b.md](../../content/dutch-foundations/part-i/review/01-b.md)
