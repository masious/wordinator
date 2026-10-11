# Ledger — Part III (Home and surroundings)

Owner: content coordinator. Part of the [content docs](index.md).

What each Part III lesson **actually** teaches, recorded from the accepted lesson file after review (not from the brief). Depth key as in [ledger-part-i.md](ledger-part-i.md).

Course: "Dutch Foundations — Part III" (`content/dutch-foundations/part-iii/`, import position offset 2: the two existing row-13 lessons come first).

Local database (2026-10-11): 14-a, 14-b, 15-a, 15-b, 16-a, 16-b, 17-a, 17-b, 18-a and 18-b are imported into the Part III course as unpublished drafts at positions 2–11, after the two published row-13 lessons. In production, 14-b exists only as the standalone course "Leggen of zetten?".

Production (2026-10-08): 14-a, 15-a, 15-b, 16-a, 16-b and 17-a are imported into the Part III course as unpublished drafts at positions 2 and 4–8, using `part-iii/course.prod.json` with 14-b's statements removed from the SQL. By the user's decision, 14-b stays only in the standalone "Leggen of zetten?" course, so Part III has a gap at position 3. Do not run the unfiltered prod SQL: its 14-b upsert would move that lesson to position 3 inside the standalone course and overwrite its draft.

| File | Title | Status |
| --- | --- | --- |
| existing/13-1.json | Mijn huis | existing (in the app; not edited) |
| existing/13-2.json | Een huis beschrijven | existing (in the app; not edited) |
| 14-a-waar-is-het.json | Waar is het? | accepted |
| 14-b-staan-liggen-zitten.json | Leggen of zetten? | published in production as a standalone mini-course |
| 15-a-mijn-buurt.json | Mijn buurt | accepted |
| 15-b-rechtdoor-en-dan-links.json | Rechtdoor en dan links | accepted |
| 16-a-met-de-tram-en-de-trein.json | Met de tram en de trein | accepted |
| 16-b-ik-ga-een-fiets-kopen.json | Ik ga een fiets kopen | accepted |
| 17-a-wat-voor-weer-is-het.json | Wat voor weer is het? | accepted |
| 17-b-lekker-weer.json | Lekker weer | accepted |
| 18-a-kleren-en-kleuren.json | Kleren en kleuren | accepted |
| 18-b-deze-jas-is-warmer.json | Deze jas is warmer | accepted |

## 13-1 Mijn huis (existing)

- **Grammar**:
  - **er is / er zijn** — basic — er is + singular, er zijn + plural, to say something exists or is present. Questions: "Is er …?", "Zijn er …?".
  - **Inversion after a fronted place with er** — intro — "In mijn appartement is er een grote woonkamer." "In het huis zijn er vier kamers." (Note: native speakers usually drop *er* here: "In het huis zijn vier kamers." Later lessons teach that *er* is optional after a fronted place.)
  - **geen** with er is: "Er is geen lift." (recycles Part I negation)
  - Lesson's own grammar note mentions "indefinite vs definite noun references, basic review of de/het", developed in 13-2.
- **Vocabulary**: het huis, het appartement, de kamer, de slaapkamer, de woonkamer, de keuken, de badkamer, het balkon, de tuin, de lift, de garage, het gebouw, de winkel (winkels), de buurt; adjectives klein, groot.
- **Expressions**: "Zijn er winkels in de buurt?", "Nee, maar er is wel een balkon." (wel for contrast, intro).
- **Story facts**: none (anonymous speakers A/B). The storyline treats these lessons as Sofia looking at the apartment in Kastanjestraat 14.
- **Defects**: fixed 2026-10-08 on top of the production version (which already carried the seeded New words): "Grammer" → "Grammar", a fill-in authors' version capitalised ("Is", "er"), "Is er een tuin?" (already fixed in production). Applied locally and in production (2026-10-08).

## 13-2 Een huis beschrijven (existing)

- **Grammar**:
  - **een → de/het for reference** — basic — a thing is introduced with een (er is een balkon) and then referred to with de/het (het balkon is klein).
  - **Adjectives with er is/zijn** — basic (recycles Part I) — "Er is een kleine keuken en er zijn twee grote slaapkamers." "een licht appartement" (een + het-word, no -e).
  - "heeft" for features: "Het appartement heeft twee slaapkamers."
- **Vocabulary**: de douche, de verdieping (op de tweede verdieping), het centrum, de m² (vierkante meter, written only); adjectives licht, zonnig; "te huur", "dicht bij", "met douche", "maar".
- **Reading passage (story-relevant)**: "Licht appartement met balkon" — te huur, tweede verdieping, grote woonkamer, kleine keuken, twee slaapkamers, badkamer met douche, klein maar zonnig balkon, geen tuin, geen garage, lift in het gebouw, 72 m², dicht bij het centrum. **This is Sofia's apartment at Kastanjestraat 14.**
- **Defects**: fixed 2026-10-08: reading answer "Ja, er is een lift.", blank spacing "Er is … balkon.", trailing empty paragraph removed. Applied locally and in production (2026-10-08).

<!-- Per-lesson entries for 14-a … 18-b are added below as lessons are accepted, in the format used in ledger-part-ii.md. -->

## 14-b Leggen of zetten?

- **Grammar**:
  - **Positional states** — basic — staan for upright/on a base, liggen for flat or lying, zitten for sitting or enclosed contents, and hangen for suspended objects.
  - **Action → state pairs** — basic — leggen → liggen; zetten → staan; zetten → zitten when seating someone; steken → zitten for putting a small object into a pocket or bag; hangen → hangen.
  - **Orientation changes meaning** — basic — "Ik zet de fles op tafel" leaves it upright; "Ik leg de fles op tafel" leaves it on its side.
  - **er + positional verb** — basic — "Er staat een bank …", "Er ligt een vloerkleed …"; fronted place and question forms are recognised and practiced.
  - **Present tense** — reinforcement — ik leg/zet/steek/hang; singular forms ligt/staat/zit/hangt; plural forms leggen/zetten/zitten/hangen.
- **Vocabulary**: de vensterbank, het schilderij, het kussen, het vloerkleed, de handdoek, de la, de kapstok, de jas, de fles, het glas, de plant, de plank, de zak, het pak, de melk; leggen, zetten, steken, staan, liggen, zitten, hangen, ophangen.
- **Story facts**: Sunday 18 October; Henk brings Sofia a plant; Tijger explores a box, a cushion and the rug while Sofia finishes the living room; Noor calls and asks where household items are.
- **Practice**: 9 progressively harder blocks, 51 items: state recognition, action selection, paired action/result fill-ins, word order, EN→NL, NL→EN, transformations, a 7-question reading, and free production.
- **Status note**: the source file passes `lesson.ts check` and is published in production as a standalone one-lesson mini-course.

## 14-a Waar is het? (accepted 2026-10-08)
- **Grammar**:
  - Prepositions of place — practiced — in, op (on top of; floors: op de tweede verdieping), onder, boven, naast, tussen … en … (never of), voor (in front of; also for), achter, tegenover, bij, aan (fixed to a wall or ceiling: aan de muur, aan het plafond), in de hoek (van), links van / rechts van; preposition + article + noun
  - Waar is / Waar zijn …? — practiced — is + singular, zijn + plural; answers use is/zijn only (positional verbs deferred to 14-b, announced in an important callout and in two notes mentioning hangt)
  - Pronouns for things — practiced — de-word → hij, het-word → het, plural → ze; the pronoun follows the article, not the meaning; typical mistake "Het is …" for a de-word
  - Inversion after a fronted place — basic — place + verb + subject ("In de keuken is de koelkast.", "Op de eerste verdieping woont Henk.")
  - er is / er zijn + place — basic (recycles 13) — for something new, with een/geen/a number, not with de/het; after a fronted place er is optional and usually left out ("In de woonkamer is een grote bank.")
- **Vocabulary** (42 words in 10 vocabulary blocks): welkom, de sleutel, de voordeur, beneden, de meterkast, naast, de meter, links, de container, het afval, achter, tegenover, de trap, Dat klopt., de vraag, de verhuizing, al; de bank (sofa), de prullenbak, onder, boven, tussen … en …, voor (in front of; new meaning), bij (by, near; earlier bij Noor 07-a, bij het raam 11-b), aan (on a wall or ceiling; new use), de muur, links van, rechts van; de hoek; het kussen; het bed; de kast; de hijsbalk; de boekenkast; het plafond; verhuizen, de hele dag, de vloer, overal, de gang, zijn van, nog (still; new meaning). Used but not listed because the Part I/II ledgers already record them: de doos (10-b), de tafel, het raam (11-b), de lamp, de plant, het bord, de tas (12-a), de spiegel, de stoel, het gebouw, de lift (12-b), de koelkast (10-a), de telefoon, de deur, het boek, de badkamer (07-b), de woonkamer, de slaapkamer, de keuken (13), leeg, alleen, de rommel, in, op.
- **Expressions**: Welkom!; Hier zijn de sleutels.; Dat klopt.; Hebt u nog vragen?; Veel succes met de verhuizing!; Waar is …? / Waar zijn …?; Welke doos?; Mag ik … meenemen?; Wat een rommel! (recycled); Hoi mam! / Veel liefs (recycled)
- **Story facts**: Saturday 17 October, moving day. At 10:00 Ingrid Visser (u, "mevrouw Moreno") hands Sofia two keys (front door downstairs, apartment). The meter cupboard is next to the apartment door, meters on the left. The bins (containers) are downstairs behind the building. The lift is opposite the stairs. Daan brings Sofia's boxes in a small rented van, with Noor. At 16:00 the living room is chaos: plates in a box next to the sofa; the white market lamp (12-b) in a small box on a chair; Sofia's bag (with her phone) under the table, next to the bin; the sofa cushion on the bed. Daan takes the empty boxes. At 20:00 Sofia writes to her mother: the sofa is by the window, the lamp next to the sofa, the table and four chairs (from Daan and Lotte) in the corner left of the door, the bookcase opposite the sofa (books still in boxes), plates in a box in the kitchen, empty fridge, her plant (12-a) on the small sunny balcony. She tidies up on Sunday and they call then.
- **Deviations from brief**: no pronunciation callout (not required). Positional verbs are absent, as required; walls and ceilings keep is/zijn, with notes that natives say hangt (14-b). "In de keuken is de koelkast" is kept from the brief; its note gives the normal order. Extra glossed words: welkom, de voordeur, beneden, de meter, links, de container, het afval, Dat klopt, de vraag, de hijsbalk, de hele dag, overal, de gang, de vloer, zijn van, nog.
- **Review log**: [14-a.md](../../content/dutch-foundations/part-iii/review/14-a.md)

## 15-a Mijn buurt (accepted 2026-10-08)
- **Grammar**:
  - kunnen — practiced — ik kan, jij kunt/kan, u kunt, hij/zij kan, wij/jullie/zij kunnen; never *hij kunt*; jij-inversion t-drop: Kun je …? (Kan je …? common in speech); u keeps kunt (Kunt u …?).
  - kunnen + infinitive at the end — practiced — ability (Noor kan goed koken), possibility (In de Kanaalstraat kun je groente kopen), polite request (Kunt u mij helpen?); everything else stands between the two verbs; *Ik kan koken goed* / *Je kunt kopen groente* marked as mistakes.
  - Separable infinitive after kunnen — basic — stays whole at the end: Je kunt hier je fiets ophalen.
  - Negation with kunnen — practiced — niet directly before the infinitive (Hier kun je niet pinnen); geen + noun (Hier kun je geen brood kopen).
  - Place / daar / hier first with inversion — practiced — Daar kun je boeken lenen.
  - kunnen + language without infinitive — intro (chunk) — Ik kan een beetje Nederlands.
  - Recycled: Is er … in de buurt? (13), naast/tegenover/boven (14-a), liggen for buildings (De bibliotheek ligt aan het plein), van … tot … opening hours, willen/mogen in the columnList.
- **Vocabulary** (35 words, 8 blocks): Mooi weer, hè?; kunnen; de bakker; open; dicht (new meaning: closed); de moskee; het park; wandelen; lenen; vlakbij; het plein; het kanaal; de apotheek; Kunt u mij helpen?; helpen; ophalen; de wijk; de slager; de fietsenwinkel; de brug; de kerk; de halte; de bushalte; ver; halen; Welkom!; Geen probleem!; Wat kan ik voor u doen?; de pas (library card); Dat kan.; Ik kan een beetje Nederlands.; maken (new meaning: to fix, informal); Turks; Marokkaans; in de zon zitten.
- **Expressions**: Kunt u mij helpen?; Wat kan ik voor u doen?; Dat kan.; Mooi weer, hè?; Ik kan een beetje Nederlands.; Welkom (in Lombok)!; Geen probleem!; Kijk eens (Ahmed, unglossed interjection); lekker wandelen; Kom je mee?
- **Story facts**: za 24 oktober Henk is home early from the market and walks Sofia round Lombok. Kanaalstraat: many Turkish, Moroccan and Dutch shops; the bakery is next to the supermarket; the bus stop is opposite the supermarket; Ahmed's bike shop. The supermarket is open every day; the bakery is closed on Sunday. The library is on the square by the canal (Tue–Sat 10–17, closed Sun and Mon; coffee; many English books, no Spanish ones); the pharmacy is next to the library, the GP above the pharmacy. There is a small park and a big mosque (locations left vague). Shops Mon–Sat 9–18, many on Sunday 12–17. Utrecht Centraal is 15 minutes' walk. Sofia meets Ahmed: she can ride a bike but has none (→ 16-b). Sofia gets a library card. Speaker "Medewerkster" (library).
- **Deviations from brief**: three dialogues (Ahmed scene is its own short dialogue). No tram stop (decision: keep transit vague, de bushalte only), so de tramhalte is dropped from the vocabulary and only de bushalte is used. Mosque location and name kept vague. de markt, de huisarts, de bibliotheek, de supermarkt, de winkel, de straat, het station and de buurt are recycled (ledgered earlier), so not re-listed; tegenover/naast/bij/boven/de hoek from 14-a/14-b and gezellig from 14-b not re-listed.
- **Review log**: [15-a.md](../../content/dutch-foundations/part-iii/review/15-a.md)

## 15-b Rechtdoor en dan links (accepted 2026-10-08)
- **Grammar**:
  - Imperative (jij) — basic — stem = ik-form, no subject: Ga rechtdoor. Neem de tweede straat. Loop tot de brug. Spelling as the ik-form (loop, neem, bel, wacht with no extra t).
  - Separable verbs in the imperative — practiced — verb part first, prefix last: Steek de brug over. Stap hier uit. linksaf/rechtsaf slaan works the same way: Sla bij het stoplicht linksaf (Ga … linksaf also fine).
  - Polite imperative — practiced — stem + t + u, verb first: Gaat u rechtdoor. Neemt u de tweede straat rechts. Never -t without u (*Gaat rechtdoor*).
  - Softeners — intro — maar (Kijk maar., Bel me maar!) and even (Wacht even!).
  - zijn → Wees — chunk — Wees voorzichtig!
  - Negative imperative — basic — Ga niet links. Neem geen bus.
  - Sequence words — practiced — eerst, dan, daarna; a statement starting with dan inverts: Dan ziet u het station.
  - Signs use the infinitive — intro (hint) — Niet roken. Niet parkeren.
- **Vocabulary** (27 words, 12 blocks): weten (ik weet, jij weet, wij weten + noun only), de weg, het kruispunt, het stoplicht, oversteken (sep.), rechtdoor, voorbij, rechts, de fietser, Wees voorzichtig!, … minuten lopen; links; tot (new use: as far as); linksaf, rechtsaf, de rotonde, het zebrapad; linksaf slaan; uitstappen (sep., one example); maar (new use: softener); Bel me maar!; parkeren; oppassen (sep.); mevrouw, Hoe kom ik bij …?, Ik loop wel.; de route. Not re-listed (known from 14-a/14-b/15-a or Part I–II): de hoek, tegenover, het plein, de brug, het station, de halte, de bakker, de supermarkt, de moskee, de kerk, vlakbij, ver, kunnen, eerst, daarna, dan, ongeveer, lopen, nemen, bellen, wachten, straks, Pardon.
- **Expressions**: Ik weet de weg niet. Hoe kom ik bij …? Pardon, waar is …? Is het ver? Het is vlakbij. Het is … minuten lopen. Wees voorzichtig! Bel me maar! Pas op voor de fietsers! Ik loop wel. Kijk maar. Wacht even! Met Sofia! Tot straks!
- **Story facts**: Saturday 24 October Sofia sends Noor the route; Sunday 25 October Noor visits Kastanjestraat 14 for the first time, gets lost near the bridge and phones. Route: Utrecht Centraal → square in front of the station → straight on to a big crossroads with traffic lights (zebra crossing) → bridge over the canal (big mosque visible) → Kanaalstraat → past the bakery and the supermarket (next to each other) → third street on the right = Kastanjestraat; no. 14 on the corner opposite a small park; Sofia on the second floor. About 15 minutes' walk from the station; from the crossroads three minutes. Bus stop in the Kanaalstraat opposite the supermarket. A tourist asks the way to Utrecht Centraal (about ten minutes' walk) and walks.
- **Deviations from brief**: "afslaan" not used; "linksaf/rechtsaf slaan" taught instead (Ga … linksaf accepted). "oppassen" used and listed (separable) though not on the brief's separable list, by decision. No false-friend or pronunciation callout (not required). "Utrecht Centraal" not listed (name known from Part II).
- **Review log**: [15-b.md](../../content/dutch-foundations/part-iii/review/15-b.md)

## 16-a Met de tram en de trein (accepted 2026-10-08)
- **Grammar**:
  - Separable verbs, full picture — practiced — conjugated part in position 1 or 2, prefix at the very end in statements (We stappen in Amsterdam over.), yes/no questions (Stap je hier uit?), question-word questions (Hoe laat komt de trein aan?), inversion after time or daarna (Om tien voor negen komt de trein in Amsterdam aan. Daarna checken we uit.) and the imperative (Check hier in. Kom op, stap in!); a met- or direction phrase may follow the prefix (Ik check in met mijn bankpas. In Amsterdam stappen we over op de tram. De trein rijdt door naar Amsterdam Centraal.); *Ik overstap* and *Overstappen we …?* marked as mistakes.
  - Separable infinitive after kunnen/mogen — practiced — stays one word at the end: Je kunt hier overstappen. Mag ik hier instappen?; *Je kunt hier stappen over* marked.
  - Polite imperative with a separable verb — basic (recycles 15-b) — Checkt u in Amsterdam ook uit.
  - Stress rule — basic — stressed prefixes (IN-, UIT-, OVER-, AAN-) split; be-, ge-, her-, ont-, ver-, er- are unstressed and never split: vertrekken, betalen, beginnen, herhalen, ontbijten; *Ik ver trek* marked.
  - Ten prefixes — basic — in-, uit-, over-, aan-, weg-, terug-, door-, op-, af-, mee-.
  - met + transport — practiced — met de trein/tram/bus/metro/fiets/auto; walking: lopend or lopen (no *met de voet*); vehicles rijden; TMP recycled (Maandag gaat Sofia met de bus naar kantoor.).
  - Hint only: De trein komt aan om tien uur is heard in speech; teach prefix last.
- **Vocabulary** (32 words, 9 vocabulary blocks): het perron, het spoor, inchecken, de bankpas, het poortje, de vertraging, overstappen, instappen, het probleem, Kom op!; uitchecken; rijden, doorrijden, wegrijden, doorlopen; herhalen; de metro; het kaartje, de ov-chipkaart, het openbaar vervoer, enkele reis, retour, de reis, Beste reizigers, de reiziger; de stiltecoupé, de spits; de conducteur, Hebt u een kaartje?, stil, Goede reis!; de laptop. Not re-listed (known): de tram, de bus (07-a, 09-b), de trein, het station, aankomen, vertrekken, rennen, op tijd, te laat, de klant, de planning (08-a), uitstappen (15-b), terugkomen (09-a), meenemen, weggaan (07-b), lopen (07-a), lopend (09-b), de halte (15-a), de fiets, de auto, de vergadering, nodig hebben, de vraag, duren.
- **Expressions**: Hebt u een kaartje?; Ik check in met mijn bankpas.; Een retour / Een enkele reis Amsterdam, alstublieft.; Beste reizigers, de trein heeft vijf minuten vertraging.; Kunt u dat herhalen, alstublieft?; Van welk spoor?; Is er vertraging?; Kom op!; Goede reis!; Mag ik uw bankpas even zien?; Bel me maar! (recycled); Je hebt geen kaartje nodig. (recycled 10-b).
- **Story facts**: ma 26 oktober Sofia, who usually walks to the office, is a little late and takes the bus (stop in the Kanaalstraat opposite the supermarket, gets off at Utrecht Centraal). Monday evening Daan sends the plan. di 27 oktober: Daan is on platform (spoor) 7 at Utrecht Centraal early; Sofia arrives at 8.12 running from the bus. Train 8.16, five minutes' delay, planned arrival Amsterdam Centraal 8.43 (about 8.50 with the delay); stops at Amsterdam Amstel, they get off at Centraal, check out, change to tram 2 (stop in front of the station), about 15 minutes to the client; meeting at 10.00. Train back at 15.00, in Utrecht at 15.30. Daan uses an ov-chipkaart, Sofia checks in with her bank card at the gates. They sit in the quiet carriage by mistake and move on. Sofia takes her laptop. No tram in Utrecht or Lombok; Sofia has no bike; Daan cycles.
- **Deviations from brief**: per coordinator decision, Sofia takes the bus (not the tram) from Lombok; the only tram is tram 2 in Amsterdam. Nine practice blocks (extra "Split or not?" drill). Extra glossed words beyond the brief: het poortje, het openbaar vervoer, de stiltecoupé, de spits, Beste reizigers, wegrijden, doorlopen, stil, de laptop, Goede reis!, Hebt u een kaartje?, herhalen, het probleem, Kom op!. Participles appear only in vocabulary `forms` (convention), never in the text.
- **Review log**: [16-a.md](../../content/dutch-foundations/part-iii/review/16-a.md)

## 16-b Ik ga een fiets kopen (accepted 2026-10-08)
- **Grammar**:
  - gaan + infinitive — practiced — a form of gaan in position 2 (ik ga, jij gaat / ga je …?, u gaat, hij/zij gaat, wij/jullie/zij gaan), the infinitive at the very end, everything else in between; no naar or te before the infinitive (*Ik ga naar kopen* / *Ik ga kopen een fiets* marked as mistakes).
  - Separable infinitive after gaan — practiced — stays one word at the end: Ik ga morgen de fiets ophalen. Sofia gaat de fiets eerst uitproberen. (*Ik ga op halen* / *Ik ga haal op* marked as mistakes.)
  - One rule for gaan, kunnen, willen, mogen — basic — second verb is an infinitive at the end (important callout and numbered list).
  - Time first + inversion — practiced — Morgen ga ik een fiets kopen. Zaterdag gaan we fietsen. (*Morgen ik ga* marked.)
  - Questions — practiced — Ga je zaterdag fietsen? Wat ga je dit weekend doen?
  - Negation — practiced — niet just before the infinitive (Ik ga vanavond niet koken); geen + noun (Ik ga geen nieuwe fiets kopen).
  - Two meanings of gaan — basic — gaan + place (movement, no infinitive) vs gaan + infinitive (plan), in a columnList; both together: Ik ga naar de fietsenwinkel lopen.
  - Present + time word for the future — basic (recycles 08-b/09-a) — Morgen koop ik een fiets.
  - Recycled: imperative (15-b: Neem een goed slot!, Fiets maar een rondje, Zet je fiets op slot!), Mag ik + infinitive, prices (12-b), hij for de fiets (14-a), deze/dit, lek → een lekke band.
- **Vocabulary** (28 words in 8 vocabulary blocks): gaan (new use: be going to + infinitive), het plan, Wat ga je doen?, dit weekend, het slot, de fietsendief, Veel plezier!; uitproberen (sep.); wegbrengen (sep.); terugbrengen (sep.); de fietsenmaker, de band, lek, de rem, de bel, het zadel, het licht (new meaning; licht adj. in 13-2), de mand, kapot; de fietsenstalling, op slot zetten; proberen, een rondje fietsen, repareren, de garantie, niet meer; eindelijk, laatste. Used but not listed (known from Part II or earlier Part III): de fiets, fietsen, kopen, tweedehands, zwart, duur, de fietsenwinkel, ophalen, straks, vanavond, morgen, overmorgen, volgende week, het weekend, de boterham, Doe maar, Geen probleem!, Kijk eens, Mag ik pinnen?, nodig hebben, gratis, iets, de doos, leeg, de sleutel.
- **Expressions**: Je gaat een fiets kopen!; Goed plan!; Wat ga je (dit weekend) doen?; Waar ga je kijken?; Veel plezier!; Doe maar.; Gezellig!; Wat kan ik voor je doen? (jij-version of the 15-a chunk); Kijk eens; Mag ik deze fiets proberen?; Fiets maar een rondje.; Hij fietst lekker!; Is er garantie op …?; Zet je fiets (altijd) op slot!; Dat ga ik doen! (glossed chunk, dat first); Niet meer met de bus!; Samen is dat …, toch?; Mag ik pinnen?; Hoi mam! / Veel liefs.
- **Story facts**: Wednesday 28 October at lunch in the office kitchen Daan learns Sofia has no bike (she takes the bus or walks to the station, 15 minutes); she plans to go to Ahmed's bike shop in the Kanaalstraat on Saturday and buy a second-hand bike (a new one is too expensive). Daan cycles with Lotte on Saturday and they eat at his mother's on Sunday. Friday 30 October Sofia writes to her mother. Saturday 31 October at 10:00 Sofia walks to Ahmed's shop and buys the black second-hand bike, €150 (new brakes and light), plus a lock €25 = €175, pays by card; three months' guarantee; Ahmed repairs the broken bell. Ahmed is a fietsenmaker. Afterwards she cycles to Noor's: 31 October is the last day of her old room, she returns the key and eats at Noor's (Noor cooks). Fleur comes back from Australia on Sunday 1 November. Sunday Sofia does not cycle: she takes the last empty boxes away and calls her mother at 11:00. From next week she cycles to the office every day ("Niet meer met de bus!"), consistent with 17-a. No tram anywhere in the lesson. Culture: the bike park at Utrecht Centraal is the biggest in the world (about 12,500 places).
- **Deviations from brief**: "overstappen" example from the brief not used (taught in 16-a). Extra glossed words beyond the brief list: de fietsendief, Veel plezier!, Wat ga je doen?, terugbrengen, de fietsenmaker, kapot, de fietsenstalling, op slot zetten, een rondje fietsen, niet meer, eindelijk, laatste. Brief-list words already known (kopen, straks, vanavond, morgen, overmorgen, volgende week, ophalen, fietsen, de fietsenwinkel) are not re-listed. Pronunciation callout added (not required). "dit weekend" kept as a listed time chunk although het weekend and dit are known.
- **Review log**: [16-b.md](../../content/dutch-foundations/part-iii/review/16-b.md)

## 17-a Wat voor weer is het? (accepted 2026-10-08)
- **Grammar**:
  - Impersonal het with weather verbs — practiced — het + stem + t (het regent, sneeuwt, waait, vriest, onweert, hagelt); inversion after time (Vandaag regent het. In de winter vriest het soms.); yes/no question verb first (Regent het?); never *Er regent* or *Het is regenen*; de zon schijnt has de zon as subject (not *het schijnt*).
  - het is + adjective or number — practiced — het is koud / bewolkt / mistig / droog / tien graden; no -e after is; also time and days (Het is laat. Het is maandag.), recycled from 08–09.
  - graad → graden after a number — practiced — tien graden, never *tien graad* (unlike tien uur, tien euro).
  - worden — basic — ik word, jij wordt (word je?), u/hij/zij/het wordt, wij/jullie/zij worden; het wordt + adjective/number for the forecast (Morgen wordt het warm.).
  - gaan + infinitive with weather verbs — practiced (recycles 16-b) — Het gaat regenen. Gaat het zaterdag sneeuwen?; do not mix with worden (*Het wordt regenen* → Het gaat regenen).
  - in de + season — practiced — in de lente/zomer/herfst/winter, months without article (in november); *in zomer* → in de zomer.
  - er zijn + plural — recycled — Er zijn veel wolken vandaag; weather verb itself always het, never er.
- **Vocabulary** (39 words, 12 blocks): het weer (new meaning; weer = again 07-b), Wat een weer!, regenen, waaien (waait · waaide/woei · gewaaid), nat, de regen, de regenjas, worden, de graad (graden), Wat voor weer is het?, schijnen, de zon (earlier only in the chunk in de zon zitten, 15-a), missen, de zomer, de paraplu (paraplu's), de wind; sneeuwen, vriezen, onweren, hagelen; de sneeuw; de wolk, de bui, de storm; de winter; bewolkt, mistig, de mist; droog; de temperatuur; het seizoen; de lente, de herfst; de weersverwachting, Er is geen slecht weer, alleen slechte kleding., Goed zo!, de buienradar, lekker weer, de kleding.
- **Expressions**: Wat een weer!; Nou, nou!; Wat voor weer is het (morgen)? / Wat voor weer wordt het?; Hoe is het weer? (in a note); Mooi weer, hè? (recycled 15-a); Lekker weer!; Er is geen slecht weer, alleen slechte kleding.; Goed zo!; Fijne avond!; Nee hoor!; Brr (unglossed interjection).
- **Story facts**: Monday 2 November, 18:00: Sofia cycles home from the office in the rain on her (second-hand) bike, meets Henk in the hallway of Kastanjestraat 14; she has no raincoat; Henk: tomorrow 8 degrees and rain; Valencia 20 degrees and sunny; Henk advises a raincoat, not an umbrella (wind). Sofia bought a raincoat on Tuesday 3 November (no scene). Wednesday 4 November Noor visits Sofia in Lombok; they plan Zandvoort with Daan on Saturday 7 November (17-b). Forecast: do 5 Nov fog in the morning, cloudy, 9°; vr 6 Nov rain all day, wind, showers, thunder in the evening, 10°; za 7 Nov sunny and dry in the morning, 12°, clouds and a shower in the afternoon; zo 8 Nov cold, light frost (0°) in the morning, then sun, 6° in the afternoon. Noor says the saying "Er is geen slecht weer, alleen slechte kleding." In Zandvoort it is always windy (Noor).
- **Deviations from brief**: Saying is used by Noor in dialogue 2 and in the culture callout and summary. Extra glossed words: missen, de mist, de buienradar, Goed zo!, de kleding (more in 18-a). Not used: hard (17-b), the balcony (13), de regenbui (only in a note to de bui), zonnig as a drill word (known from 12-b). "Wat voor weer is het morgen?" is kept beside "Wat voor weer wordt het?" (both natural).
- **Review log**: [17-a.md](../../content/dutch-foundations/part-iii/review/17-a.md)

## 17-b Lekker weer (accepted 2026-10-11)
- **Grammar**:
  - Adjective before a noun — practiced (recap of Part I) — -e with de-words and after de/het; no -e with een/geen/no article + singular het-word (een koude dag, een koud weekend, een harde wind, een lange wandeling).
  - Adjective after zijn/worden — practiced — never an ending (De dag is koud. Het wordt warm. De zee is kalm.); *De dag is koude* → De dag is koud.
  - Adverb = base form — practiced — same word as the adjective, never -e, no -ly (Het waait hard. Daan loopt snel. Sofia loopt langzaam. Het gaat goed.); *Hij fietst snelle* → Hij fietst snel; adjective → adverb transformation (De wind is hard. → Het waait hard.).
  - Intensifiers heel, erg, best, een beetje, te — practiced — right before the adjective/adverb, never inflected themselves; een heel koude dag (written standard; een hele koude dag noted as spoken); best = quite/fairly (false friend); te = too (recycles 12-b).
  - lekker as adjective and adverb — basic — lekker weer, De chocolademelk is lekker., Het is lekker warm., Vanavond slaap ik lekker.
- **Vocabulary** (19 words, 5 blocks): het strand, de zee, de golf (wave; not het golf, the sport), het duin (also de duin), het zand; kalm, hard, langzaam, juist, zacht, het strandcafé, de wandeling; erg, best (quite, fairly); schuilen, nog steeds, de warme chocolademelk, Goed idee!; Tot snel!. Not re-listed (known): heel (very, 10-b), snel (07-b), goed, slecht, mooi, druk, rustig (Part I), lekker (07-a), lekker weer, nat, droog, de zon schijnt, waaien, regenen, worden, de bui (17-a), heerlijk, fijn (11-b), warm, koud, een beetje (10-b), te (08-a/12-b), vroeg, laat (07-a), wandelen (15-a), binnen, buiten, de ober (11-a), bijna (10-a), Goed plan! (16-b), Kom op! (16-a).
- **Expressions**: Lekker weer!; Heerlijk, hè?; Goed plan.; Goed idee!; Kom op!; Lopen we naar …? / Nemen we nog een chocolademelk? (suggestion without zullen); Drie warme chocolademelk, graag!; Tot snel!; Hoi mam! / Liefs (recycled).
- **Story facts**: Saturday 7 November: Sofia, Noor and Daan take the train to Zandvoort, changing in Haarlem (no times). Morning: sunny, calm sea, almost no wind; Daan walks fast, Sofia slowly, Noor in between ("lekker rustig"); they walk on the beach towards the dunes. Afternoon: the wind blows hard and a heavy shower comes; they shelter in an unnamed strandcafé and drink hot chocolate served by an Ober. Noor writes her mother a message from the café; tomorrow will be dry again. No tram, no bike or raincoat mentioned.
- **Deviations from brief**: Extra glossed words: het zand, schuilen, juist, nog steeds, Goed idee!, Tot snel!. "te druk voor mij" dropped (object pronoun off-limits until row 37). In the morning dialogue the wind is weak and Noor says it is often hard at the sea; the hard wind comes in the afternoon (keeps "de zee is kalm" consistent).
- **Review log**: [17-b.md](../../content/dutch-foundations/part-iii/review/17-b.md)

## 18-a Kleren en kleuren (accepted 2026-10-11)
- **Grammar**:
  - Attributive adjective endings, full system — practiced — adjective before a noun gets -e; the one exception is a singular het-word after een, geen or no article (een rood shirt, geen rood shirt, warm water); -e after het, dit/dat and possessives (het/dit/mijn rode shirt); de-words always -e (de/een/geen/mijn/deze rode jas); plurals always -e (rode jassen, geen grote schoenen).
  - Dit is / Dat is + een — basic — dit/dat as subject leaves een as the determiner, so the exception applies (Dit is een rood shirt.) vs attributive dit (Dit rode shirt is nieuw.).
  - Spelling before -e — practiced — long vowel loses a letter (groot → grote, geel → gele); short vowel doubles the consonant (wit → witte, dik → dikke, dun → dunne); s → z, f → v after a long vowel or ij (grijs → grijze, lief → lieve); paars → paarse (s stays after r); regular blauwe, groene, zwarte, bruine.
  - No ending ever — practiced — oranje, roze, material adjectives in -en (wollen, katoenen).
  - Predicative and adverb — recycled (Part I, 17-b) — no ending (Deze trui is rood. De broek past goed.).
  - Colours as nouns — basic — Rood is mooi.; in het + colour (Hebt u deze trui ook in het blauw? Noor is vandaag in het blauw.); donker-/licht- shades follow the normal rules (een donkerblauwe jas, lichtgroene sjaals).
  - Separable aantrekken/uittrekken — recycled (16-a, 15-b imperative) — Sofia trekt de trui aan. Trek je jas maar uit.
- **Vocabulary** (39 words, 7 blocks): de kleren, de trui, het shirt, de winterjas, dun, dik, de kledingwinkel; het T-shirt, het overhemd, het vest, de broek, de spijkerbroek, de rok, de jurk, de schoen, de laars (laarzen), de sok, de sjaal, de muts, de handschoen; dragen, aantrekken, uittrekken; oranje, roze, bruin, grijs, geel, groen, blauw, paars; wollen, katoenen, donker- / licht-; de maat, de paskamer, achterin, passen (new meaning: to try on; to fit from 08-a); de kleur (de kleuren) (added by the coordinator: used unglossed in the reading's "In welke kleuren is de dikke wollen trui?"). Known and not re-listed: de kleding (17-a), de jas (14-b), de regenjas (17-a), rood (10-a), wit, zwart (12-b), warm, koud, nieuw, lief, groot. de verkoopster is a speaker label only (storyline minor speaker), not a term.
- **Expressions**: Kan ik u helpen?; Welke maat hebt u?; Ik heb maat 38.; Hebt u deze trui ook in het blauw?; Mag ik deze broek passen?; De paskamer is achterin.; Wilt u … meenemen?; lekker warm; Goed idee. (17-b); Dat klopt. (14-a).
- **Story facts**: Saturday 14 November: in Sofia's bedroom Noor says Sofia has no warm coat; from Valencia Sofia only has a thin jacket and a red sweater. They go shopping in the centre. In a clothing shop ("Kledingwinkel De Tulp") the Verkoopster helps; Sofia wears size 38, tries on black jeans (they fit) and gets a blue woollen sweater; she takes the sweater and the jeans. The winter coat is not bought yet: the dialogue ends with Noor pointing at the winter coats, leading into 18-b.
- **Deviations from brief**: de blouse not used. Reading is a shop catalogue page (Kledingwinkel De Tulp, renamed from "De Kastanje" to avoid confusion with Sofia's Kastanjestraat). Extra glossed words: de kledingwinkel, achterin, katoenen, de kleur. Comparatives and superlatives completely absent, reserved for 18-b.
- **Review log**: [18-a.md](../../content/dutch-foundations/part-iii/review/18-a.md)

## 18-b Deze jas is warmer (accepted 2026-10-11)
- **Grammar**:
  - Comparative — practiced — adjective + er (warm → warmer, klein → kleiner, lang → langer, goedkoop → goedkoper); spelling as with -e: double vowel letter becomes single (groot → groter), consonant doubles after a short vowel (dik → dikker, dun → dunner); after -r add -der (duur → duurder, ver → verder, lekker → lekkerder); *meer warm* / *duurer* avoided.
  - dan after a comparative — practiced — "Deze jas is warmer dan die jas."; *warmer als* marked as a mistake.
  - Irregular comparatives — basic — goed → beter, veel → meer, weinig → minder (minder duur, minder kwaliteit).
  - Equality — practiced — even … als / net zo … als + base adjective ("Deze jas is even duur als die jas.", "Utrecht is net zo gezellig als Valencia."); negative niet zo … als.
  - Comparative before a noun — basic — takes -e (de/een duurdere jas, de warmere jas); het-word after een/geen stays bare (een warmer vest), same exception as 18-a.
  - Demonstratives as pronouns with comparatives — intro — "Deze is warmer, maar die is mooier." (12-a recycled).
- **Vocabulary** (16 words, 4 blocks): de kwaliteit, de keus, kiezen, twijfelen, vergelijken (inseparable), zwaar, licht (new meaning: light in weight; licht = bright 13-2, het licht 16-b), praktisch, dan (new use: than; dan = then 08-b), beter; meer, minder; even … als, net zo … als, niet zo … als; Die jas staat je goed. Not re-listed (known): de prijs, nemen, lang, kort, warm, koud, duur, goedkoop, mooi, lelijk, zwart, gezellig, missen, de regenjas, de winter, Spanje, Precies, Prima, meenemen; and all clothing/colour words from 18-a (de jas, de winterjas, de trui, de sjaal, het vest, dik, dun, donker-/blauw, passen, de maat, de paskamer, "Hij past goed.").
- **Expressions**: Die jas staat je goed.; Ik twijfel.; Een goede keus!; Wilt u deze nu meenemen?; Mis je de zon?; Dan kan de winter komen!; Welkom thuis!; Ik ben hier nu thuis.
- **Story facts**: Saturday 14 November, same shop visit as 18-a: before paying for the dark-blue coat, the Verkoopster shows Sofia a cheaper black coat. Black: €80, short, light, good quality. Dark blue: €120, long, thicker, heavier, warmer, better quality. Sofia compares, pays €120 (no discount) and chooses the dark-blue coat. She comes home to Kastanjestraat 14; Henk and Tijger are in the hallway; the coat is warmer than her raincoat (since 3 November). Utrecht is colder than Valencia and the winter longer; she misses the sun a little; her apartment is cosier than her old room at Noor's and smaller than the house in Valencia (her mother's house, reading) but just as cosy. This closes Part III: "Dan kan de winter komen! Welkom thuis, Sofia!" / "Ik ben hier nu thuis."
- **Deviations from brief**: Brief's vocabulary items that 18-a owns (dik, dun, donkerblauw, zwart, "Hij past goed.") or that are already known (de prijs, nemen, lang, kort, warm, koud, duur, goedkoop, mooi, lelijk) are not listed here, by coordinator decision. The required closing line is kept verbatim (elliptic "net zo gezellig"); the full pattern appears elsewhere in the examples and reading. Off-limits checked: no superlatives, no omdat/subordinate clauses, no liever, no past tense, no object pronouns except the allowed chunk.
- **Review log**: [18-b.md](../../content/dutch-foundations/part-iii/review/18-b.md)
