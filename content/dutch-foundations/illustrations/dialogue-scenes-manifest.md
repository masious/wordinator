# Dialogue scene asset staging manifest

This local staging manifest covers the second half of the authored dialogue set (lessons 30–40). It is intentionally independent of the API and database implementation. The image uploader can use each `source` as the gpt-image style reference, persist the generated location under the lesson/dialogue id, and attach the listed cast portraits. No R2 objects were written by this staging pass.

Each row's dialogue IDs share the explicitly listed location brief, staged asset key, and cast set; the two blocks are separate dialogue records and should receive separate image rows that point to the same location asset when persisted.

| Lesson | Dialogue ids | Location brief | Source reference | Cast |
| --- | --- | --- | --- | --- |
| 30 — Omdat ik werk | `760b1036-c981-4827-ae3f-91b2b91c4068`, `46ef3591-27aa-4f0d-baa2-83579d68d6ef` | Small Utrecht IT office, desks and warm light; keep computer screens blank in the location plate. | `illustrations/candidates/picked/part-vi-30-0.png` | Sofia, Daan, Karin |
| 31 — Want of omdat? | `92f07c87-a832-4d85-a96b-f76af4fb1d6c`, `c8e304c3-dca2-4577-96f6-272203132aa4` | Utrecht city library classroom at 19:00, window light, board and desks; no legible writing. | `illustrations/candidates/picked/part-vi-31-0.png` | Sofia, Piotr, Marieke |
| 32 — Wat is het leukst? | `2452b6a0-28b9-414a-8681-7c6f3076aaec`, `5a80bce6-0323-49ee-98a3-c3abc31883fd` | Warm home dining table with familiar dishes and a simple unlabeled map; no readable text. | `illustrations/candidates/picked/part-vi-32-0.png` | Sofia, Noor |
| 33 — De collega die hier werkt | `c447a54d-9262-4880-8802-200677c81866`, `f7b17a0f-4740-4163-9608-92136e05b38d` | Utrecht office with a computer, small card and wall picture; leave all screens blank. | `illustrations/candidates/picked/part-vi-33-0.png` | Sofia, Karin, Daan |
| 34 — Om te studeren | `f04dec36-d3ef-4924-ae35-70bc6c9e1961`, `82dbcf94-1d53-4812-8275-26682b7aaa67` | Quiet library table with open Dutch book, dictionary, word list and notebook; no legible writing. | `illustrations/candidates/picked/part-vi-34-0.png` | Sofia, Noor |
| 35 — Als ik tijd had | `20004243-eb38-4df1-8fe1-9e7429be8cdc`, `bacf9131-d097-444d-b19e-18e1051a22d2` | Utrecht café table, park and swimming-pool map as an unlabeled prop; imagined possibilities can be added per line later. | `illustrations/candidates/picked/part-vi-35-0.png` | Sofia, Noor |
| 36 — Wat gaan we morgen doen? | `c9380fd2-5240-47d3-b8f0-6c74f61fe786`, `f4cd2515-1bfb-489b-a461-fb007a128306` | Quiet library classroom after Dutch class, weekly timetable on wall but no legible writing. | `illustrations/candidates/picked/part-vi-36-0.png` | Sofia, Piotr |
| 37 — Een klein probleem | `a83289eb-1681-4e36-8d54-b7c7a3af5807`, `c6715475-68e5-416e-8f54-f121ebf6f430` | Ahmed’s practical bicycle shop on Kanaalstraat, workbench and bicycle; no visible damage or text. | `illustrations/candidates/picked/part-vii-37-0.png` | Sofia, Ahmed, Henk |
| 38 — De dokter en de balie | `f1e16fc3-583b-4b7f-a34b-91f868203a44`, `a36426f8-8fd9-474a-a288-dfc204fb4ed9` | Central library classroom used for role-play, desks and cards without legible labels; no real medical visit. | `illustrations/candidates/picked/part-vii-38-0.png` | Sofia, Piotr, Marieke |
| 39 — Een bericht schrijven | `4d7303f1-c43c-4539-be85-6ed8595500cb`, `ec5f3044-9617-45f8-bb20-1a8d7661c2cb` | Kitchen table with phone and laptop showing blurred message drafts; no readable text. | `illustrations/candidates/picked/part-vii-39-0.png` | Sofia, Noor |
| 40 — Sofia vertelt haar verhaal | `b51e4cea-aa06-4b0e-8391-6d93c560cac2`, `c3ceb5eb-d2d7-4bbd-b555-c5fa19286aa0` | Utrecht apartment kitchen table, notebook timeline as a blank or softly blurred prop; calm January daylight. | `illustrations/candidates/picked/part-vii-40-0.png` | Sofia, Noor |
| 21a — Zullen we Sinterklaas vieren? | `eae94847-b72f-454a-ab21-f0f0305c1fd0`, `46154010-d8f6-4991-b135-15d0f2521b33` | Noor’s Utrecht kitchen on a winter evening, three friends around a nearly empty dinner table, a small bowl of pepernoten; phone screens blank. | `illustrations/candidates/picked/part-iv-21-a-0.png` | Sofia, Noor, Fleur, Daan |
| 21b — Ik haal je op | `ebdec1cd-27a7-4619-8c12-8bf68032ce5f`, `d6aabb94-9dcb-413e-acf3-e503a7e3896c` | Small Utrecht office desk, Sofia and Daan checking a phone invitation; calendar and screens must have no legible text. | `illustrations/candidates/picked/part-iv-21-b-0.png` | Sofia, Daan, Piotr |
| 22a — Wat ben je aan het doen? | `a3c60c48-ac89-4c7e-9919-2d4d186fb829`, `eba28f00-351a-4890-a3af-64dc2e9c3a42` | Sofia’s Lombok apartment table with cardboard bicycle craft and a new bell; keep all poem and phone surfaces blank. | `illustrations/candidates/picked/part-iv-22-a-0.png` | Sofia, Noor, Henk |
| 22b — Pakjesavond | `448e9ef4-ffd0-4a16-8ad6-0086dcef66a6`, `d4c4f66b-5233-455f-ba20-078df2219ba3` | Cozy Utrecht flat on Sinterklaas evening, five friends around a table with pepernoten, chocolate letters and a cardboard bicycle surprise; no legible text. | `illustrations/candidates/picked/part-iv-22-b-0.png` | Sofia, Noor, Daan, Fleur, Lotte |
| 23a — Mag ik vrij nemen? | `cfb56578-ec5a-40dc-9688-08e91de30bb0`, `edb8f979-50e8-4575-ad68-89c17b89ee55` | Utrecht office with Sofia and Karin beside a blank leave calendar and laptop; winter light, no readable dates or UI text. | `illustrations/candidates/picked/part-iv-23-a-0.png` | Sofia, Karin, Badmeester |
| 23b — Dat hoeft niet | `8ac1e041-8a3a-4bff-a547-0bce49055266`, `1128c91b-532d-4a07-b448-3171403c5c75` | Sofia’s kitchen table with phone messages and a simple food-and-flowers list rendered as blurred marks. | `illustrations/candidates/picked/part-iv-23-b-0.png` | Sofia, Henk, Lotte, Piotr |
| 24a — Wat vind jij ervan? | `4225dbc5-8f30-4629-80a7-0363790da73d`, `6c8a8533-444b-458b-afa7-3a913e34eb7c` | Sofia’s Lombok housewarming dinner: friends around a table with paella, boerenkoolstamppot, pierogi, bread and cheese; no signs or labels. | `illustrations/candidates/picked/part-iv-24-a-0.png` | Sofia, Noor, Henk, Piotr, Fleur, Daan, Kasia |
| 24b — Ik denk dat het gaat sneeuwen | `99a61470-673d-431d-a28a-37ae4c85ea2b`, `389ce6b9-03d6-47f9-9025-3243c1bae340` | Utrecht city library classroom after the last class, winter coats nearby and a teacher speaking to two students; board blank. | `illustrations/candidates/picked/part-iv-24-b-0.png` | Sofia, Piotr, Marieke, Henk |
| 25 — Wat heb je gisteren gemaakt? | `9b9c890b-079a-4ff2-b65c-3e550fb99076`, `df05b8f6-dc0e-4dbb-8892-2b3cb0cea5f1` | Noor’s familiar Utrecht kitchen on a winter morning, tea mug and small travel bag; keep surfaces blank. | `illustrations/candidates/picked/part-v-25-0.png` | Sofia, Noor |
| 26 — Waar ben je heen gegaan? | `1fa1ee41-5c92-4c5c-99a3-7775bdd2b8d7`, `838c88f5-e1d1-4f84-82bd-9d0f31bfb35e` | Sofia’s Utrecht apartment kitchen table with an unlabeled city map; no readable map text. | `illustrations/candidates/picked/part-v-26-0.png` | Sofia, Noor |
| 27 — Wat heb je gezien? | `73fab6e5-e342-4e36-9726-493822060a05`, `95f0ffd7-e3e3-49a8-a35c-a516966b0ef7` | Utrecht home table with holiday photographs, a book and tea cups; photographs contain no legible writing. | `illustrations/candidates/picked/part-v-27-0.png` | Sofia, Noor |
| 28 — Toen ik jonger was | `3cae05f8-db7d-4efd-9ed0-4bbbc3aee4e7`, `0ef35c3d-e71a-4d6a-a588-44f05b3f8574` | Warm Utrecht kitchen table where Sofia and Noor remember childhood scooters and playgrounds; no family members depicted. | `illustrations/candidates/picked/part-v-28-0.png` | Sofia, Noor |
| 29 — Eerst, daarna, uiteindelijk | `17447302-1f96-45d2-96c1-bd7cfe616dc3`, `5e4ab70a-42fc-4583-bb11-469aff33697c` | Sofia’s Utrecht home on a calm January day, paper route map with city centre, park and home represented without labels. | `illustrations/candidates/picked/part-v-29-0.png` | Sofia, Noor |

## Generation notes

Use the existing production image as the first reference and keep the canonical painterly cartoon look. Generate one empty location plate per lesson; both dialogues in a lesson may reuse that plate. Generate one portrait per cast member and reuse it across lessons. Per-line scene variants are optional and should be added only for lines whose gesture or object materially helps comprehension. Do not bake Dutch or English text into any image; render lesson text in the UI.

## Text-only staging outputs

These outputs were generated without sending repository reference images. They are local files pending review and upload:

- `candidates/gpt-image/dialogue-scenes/21-a/location.png`
- `candidates/gpt-image/dialogue-scenes/21-b/location.png`
- `candidates/gpt-image/dialogue-scenes/22-a/location.png`
