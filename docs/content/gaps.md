# Dutch Foundations — gaps and backlog

Owner: content coordinator. Part of the [content docs](index.md).

Everything the curriculum promises that is not (yet) fully taught in a Wordinator lesson, so a future session knows where to come back. Each entry says what is missing and where it should go. Remove an entry only when an accepted lesson covers it, and update [topic-map.md](topic-map.md) at the same time.

## 1. Parts with no lessons

### Part I — First Dutch (rows 1–6)

Being written, lesson by lesson, starting with 01-a (user's priority, 2026-10-12). Plan in [briefs-part-i.md](briefs-part-i.md): 12 lessons (01-a … 06-b), full briefs for 01-a and 01-b, scope lines for the rest (each brief is written before its lesson). Story: the arrival week, di 1 – zo 6 september 2026 ([storyline.md](storyline.md#part-i-the-arrival-week)). No lesson is accepted yet, so Parts II–IV still rely on the target list in [ledger-part-i.md](ledger-part-i.md#target-what-part-i-must-teach). Open points:

- **Course**: the user must create the Part I course in the app and give its ID before any import (`part-i/course.json` does not exist).
- **Target items the outline does not name**, now planned: negation niet (03-b) and geen (04-b), conjunctions en/maar/of (03-a), jij-inversion t-drop (03-b; seen as a fact in 02-a). Check each against the accepted lesson.
- **Must not take later topics**: plural verb forms (07-a; only zijn has plural forms in Part I), separable verbs (07-b), clock times (08-a), inversion after a fronted element (08-b), days/months/dates (09-a), noun plurals (10-a), demonstratives (12-a; "Dit is …" only as a chunk), colours (18-a). The full list is the [Part-I-wide off-limits](briefs-part-i.md#part-i-wide-off-limits).
- **Lighter volume**: Part I lessons have their own targets ([Volume targets (Part I)](briefs-part-i.md#volume-targets-part-i)); `content/dutch-foundations/tools/WORKER.md` and `REVIEWER.md` still state the Parts II+ numbers (45 items, 85–120 steps), so worker and reviewer prompts for Part I must say that the Part I targets override them.
- **Vocabulary overlap**: Part I may list basic words that Part II–IV lessons also list as new (de vriendin, de moeder, het kantoor, de fiets …). Each course has its own word list; accepted as a known overlap.
- **Karin and Els have no frozen visual sheet**: Karin's spec is in `cast.json` but not frozen; Els is not in `cast.json`. Until they are, scenes describe them as `extras`.

### Part IV (rows 19–24)

19-a, 19-b and 20-a are written, reviewed and accepted (see [ledger-part-iv.md](ledger-part-iv.md)); 9 lessons remain (20-b … 24-b) in [briefs-part-iv.md](briefs-part-iv.md), story beats in [storyline.md](storyline.md), skeleton in [ledger-part-iv.md](ledger-part-iv.md). Before any import, the user must create the Part IV course in the app and give its ID (`part-iv/course.json` does not exist yet).

- Row 20 systematises what Parts II–III did ad hoc (willen/mogen 11, kunnen 15, gaan 16-b) and adds moeten (20-a, done); niet position and inversion triggers go to 20-b.
- Row 23 overlaps with 11 (mogen) and 15-a (kunnen); 23-a contrasts kunnen/mogen/moeten, 23-b focuses on hoeven and moeten ↔ niet hoeven.
- Object pronouns are moved forward from row 37 to 21-b (basic: me/mij … ze, hem/het/ze for things). Row 37 keeps hen/hun, er- forms and polite zou.
- New recurring characters (Fleur as cast, Marieke, Piotr Kowalski, Karin Smit) are in `illustrations/cast.json` but have no frozen sheets yet: generate and freeze them before any Part IV scene is generated (see [illustrations.md](illustrations.md#visual-canon)).

### Parts V–VII (rows 25–40)

Not written. See the `missing` rows in [topic-map.md](topic-map.md). Notes for whoever writes them:

- The storyline ends on Friday 18 December 2026 (end of Part IV): Sofia flies to Valencia on za 19 december and returns on zo 3 januari 2027. Part V can open in January 2027 and retell Parts II–IV and the holiday in the past tense ("Sofia is in september naar Utrecht gekomen", "Wat heb je met kerst gedaan?").
- Parts II–IV have no past tense at all.
- Part IV leaves partial te-constructions (hoeven … te, zitten te) and dat-clauses after four verbs; row 30 should start from these and add omdat/als, row 34 om … te.

## 2. Simplified or deferred in Parts II–IV

Planned simplifications (from the briefs). Confirm or revise after each lesson is accepted.

| Topic | Where | What was left out | Come back in |
| --- | --- | --- | --- |
| er is / er zijn | 13-1, 13-2 (existing) | Existing lessons are thin and have typos; "er" after a fronted place is presented as normal although natives usually drop it. | Fix the existing lessons (owner decision); 14-a explains that *er* is optional after a fronted place. |
| Modal + infinitive | 11-a, 11-b, 15-a | Only short sentences; no two verbs at the end, no separable-infinitive drills until 16. | Planned: 20-a (system, moeten, modal + gaan + infinitive intro). |
| Inversion triggers | 08-b | Taught with time words and dan/daarna; other fronted elements (objects, adverbs of manner) only implicitly. | Planned: 20-b (any element first). Integration in row 40. |
| Position of niet | throughout | Only "niet before the infinitive / adjective / at the end"; no systematic rules. | Planned: 20-b (system), 24-b (in dat-clauses). Not in the outline. |
| Diminutives | 10-b | Only "-je words are het"; formation -tje/-pje/-etje not taught. | Planned: 21-a (section with Sinterklaas words). Not in the outline. |
| Object pronouns | throughout | Only fixed chunks (Dank je, Kunt u mij helpen?, Die jas staat je goed). hem/haar/ze for things avoided. | Planned: 21-b (basic, people and things). hen/hun and er- forms stay in row 37. |
| Superlatives | 18-b | Comparative only. | Row 32. |
| graag (liking), liever | 11-a, 18-b | Only "Ik wil graag", "Ja, graag". | Planned: 19-b. het liefst deferred to row 32. |
| Reflexive daily-routine verbs | 07-a, 07-b | zich aankleden, zich wassen avoided. | Row 38. |
| Imperative before 15-b | 07–14 | Only fixed chunks (Kijk!, Wacht even!, Ga zitten). | 15-b (done there). |
| Superlative het liefst | 19-b (planned) | Preference stops at liever. | Row 32. |
| zullen as future/promise | 21-a (planned) | Only Zullen we …? / Zal ik …?. | Row 36. |
| te + infinitive | 22-b, 23-b (planned) | Only zitten/staan/liggen te (intro) and hoeven … te. | Row 34 (om … te, proberen te, beginnen te). |
| hen/hun, er- pronominal adverbs, independent possessives (de mijne) | 21-b, 24-a (planned) | Only me/mij … ze and hem/het/ze; "Wat vind je ervan?" as a chunk. | Row 37. |
| Subordinate clauses beyond dat | 24-b (planned) | Only dat after vinden, denken, hopen, zeggen; no weten dat, no fronted dat-clause; chunks like "Leuk dat je komt!" avoided before 24-b. | Rows 30, 31, 33, 39, 40. |
| Reflexive verbs in leisure contexts | 19–24 (planned) | zich vervelen, zich verheugen op avoided (saai, Ik heb zin in … instead). | Row 38. |
| Diminutive noun used before the rule | 19-a | "het spelletje" is listed as a plain vocabulary noun (meaning "game"); the -je ending is never explained as a diminutive. | 21-a teaches diminutive formation; recycle het spelletje there as a worked example. |
| Two infinitives at the end (modal + gaan + infinitive) | 20-a | Recognition only, a handful of drill items ("Ik wil vanavond gaan zwemmen."); not drilled as a system. | Deepen as later Part IV/V lessons add more modal combinations. |

## 3. Vocabulary and skills to revisit

- **Clothes vocabulary** (18-a) comes after "shopping" (12); clothes shopping skills are therefore split over 12-b and 18-a/b.
- **Colours** appear only in 18-a; before that only zwart/wit (12-b onwards).
- **Seasons** only from 17-a.
- **Listening/pronunciation**: lessons are text-only; pronunciation is covered in callouts only. Audio is outside the current lesson format.
- **Writing longer texts**: each lesson has one free-production item; there is no lesson focused on writing messages until row 39.

## 4. Outline issues noticed

- Row 13 grammar (er is/er zijn) is needed for natural descriptions in Part II, which therefore avoids it (uses "hebben" and "is" instead).
- Rows 11 and 15 introduce modals with an infinitive at the end before row 20 "modal verbs + infinitive"; row 20 should be a consolidation lesson. Planned that way in 20-a.
- Row 22 (aan het) has a natural sibling, zitten/staan/liggen te + infinitive, which uses te before row 34; planned as an intro in 22-b (approved by the user, 2026-10-11).
- Row 23 needs te for hoeven ("Je hoeft niet te komen"), also before row 34.
- Row 37's object pronouns are needed for invitations (row 21); planned in 21-b at basic depth (approved by the user, 2026-10-11).

## Part II review follow-ups (2026-10-08)

- **Henk's surname**: resolved 2026-10-08 — dropped; 12-b uses "meneer" alone.
- **Positional verbs before row 14**: 10-a avoids "staan in de koelkast" and uses other phrasing. After 14-b, recycle "staat/ligt in de koelkast" in later lessons. Planned recycling: 21-a, 22-a, 22-b (with te), 23-b.
- **Bitterballen**: 10-b serves 40 bitterballen that are not on 10-a's shopping list. Assume they come from the freezer, and do not contradict this later.
- **Unglossed chunks**: the reviewers glossed most of them at first use. The full list per lesson is in the [Part II ledger](ledger-part-ii.md) "Expressions" entries. Treat these chunks as known from now on, but not as taught grammar.

## Part III review follow-ups 16-a … 17-a (2026-10-08)

- **Separable participles** (16-a): ingecheckt, overgestapt etc. appear only in vocabulary `forms`; the perfect is row 25 onwards.
- **Prefix before a time expression** (16-a): "De trein komt aan om tien uur" is mentioned as spoken usage in a hint only; the lesson teaches prefix last.
- **Public-transport culture** (16-a): bikes on trains (not in rush hour, weekdays 6:30–9:00 and 16:00–18:30), check-out fines and OVpay are simplified to one or two sentences each.
- **Trams in Utrecht**: deliberately absent from the story (Lombok has buses only); the only tram is tram 2 in Amsterdam (16-a). Do not add a Utrecht tram later.
- **Object pronoun hem for things** (16-b): still avoided ("Mag ik deze fiets proberen?"); "Wat kan ik voor je doen?" stays a chunk. Now planned in 21-b.
- **Weather past tense** (17-a): waaien's past forms (waaide/woei) appear in `forms` only; the past is row 25 onwards.
- **worden** (17-a): present forms and "het wordt + adjective/number" only; other uses later.
- **de regenbui** (17-a): only in a note to de bui; **de kleding** glossed in the saying, taught properly in 18-a.

## Part III review follow-ups 17-b … 18-b (2026-10-11)

- **Object pronouns** (17-b, 18-b): still avoided throughout; "te druk voor mij" (17-b brief) was dropped to plain "te druk", and 18-b's "Wilt u hem nu meenemen?" was rewritten with the demonstrative "deze". Now planned in 21-b (basic); row 37 completes.
- **graag / liever** (18-b): comparative "liever" (graag → liever) stays off-limits per the global list; 18-b uses "Ik twijfel." / "Ik kies …" instead. Now planned in 19-b.
- **Superlatives** (18-a, 18-b): both lessons stop at the comparative; no superlative forms appear anywhere in Part III. Row 32, Part VI.
- **Independent possessives** ("het jouwe", "de mijne"): avoided in 18-b (a worker draft used "net zo … als het jouwe"; the reviewer replaced it with a full noun phrase). Not in the outline; not planned in Part IV (21-b teaches object pronouns only). Deferred to row 37.
- **te + infinitive**: a worker draft of 18-a briefly used "om te kijken"; the reviewer removed it. Confirms the off-limits list is still being tested against in practice, not just by convention. Row 34; Part IV allows only hoeven … te (23-b) and zitten/staan/liggen te (22-b).
- **dan vs toen/als**: 18-b's "dan" (than, after a comparative) is a new use of an already-known word (dan = then, 08-b/15-b); both uses now coexist and are distinguished by context and by note. Watch for confusion if a later lesson adds "als" (when/if, row 30). Part IV adds a third "dat" (conjunction, 24-b) next to the demonstrative; 24-b must contrast them.

## Part IV review follow-ups 19-a … 20-a (2026-10-11)

- **New characters' first appearances**: Marieke, Piotr (19-a) and Fleur (19-b) are now in the story; Karin Smit appears from 20-a. None has a frozen visual sheet yet (see "Part IV" above).
- **Piotr's football club**: the worker's draft of 19-a had Piotr playing *in* FC Utrecht (the city's professional club); the reviewer corrected this to a small amateur club, with FC Utrecht as his favourite club to watch. Keep this distinction in later lessons that mention Piotr and football (20-b mentions him, 21-b, 23-b, 24-a, 24-b).
- **Kasia's hobby**: storyline.md fixed only "Kasia loves music"; 19-a adds that she plays guitar and sings in a choir. This is now a fixed fact (see storyline.md) and does not conflict with Lotte's own optional "sings in a choir" detail — more than one character may sing in a choir.
- **Fleur's dinner at Noor's (19-b)**: the worker's draft had Fleur decline dinner and leave for a friend's; this contradicted brief 19-b's own Dialogue 2 cast (Sofia, Noor, Fleur together) and its required "Blijf je eten?" / "Ja, graag!" exchange. The reviewer fixed it so Fleur stays; see the ledger and review log for the corrected version. Treat Fleur as present for the rest of that scene in any later reference to this evening.
- **makkelijk (19-a/19-b)**: both lessons' workers listed "makkelijk" as new vocabulary; since 19-a introduces it first, the coordinator removed the duplicate entry from 19-b after both reviews finished. 19-b now recycles it unglossed. Watch for this kind of duplicate whenever two lessons in the same batch share source material (here: both lessons compare swimming/skating difficulty).
- **Karin Smit's team-leader voice (20-a)**: established as direct, calm and organised, per storyline.md; she assigns tasks explicitly (Daan tests, Sofia does screens, Karin prepares the presentation) rather than asking the team to volunteer. Keep this consistent in 23-a, her other appearance.
