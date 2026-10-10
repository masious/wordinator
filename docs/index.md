# Wordinator documentation

These files are the living specification for Wordinator. Each topic has one primary owner; other documents should link to it instead of restating detailed rules.

| Document | Owns |
| --- | --- |
| [what_is_it.md](what_is_it.md) | Purpose, target learner (committed desktop Dutch/German learners), value, success, and business context |
| [product-requirements.md](product-requirements.md) | Release scope, global rules, non-goals, and acceptance summary |
| [user-flows.md](user-flows.md) | End-to-end behavior from a user’s perspective |
| [groups-and-membership.md](groups-and-membership.md) | Retired group model and temporary storage-compatibility boundary |
| [authentication.md](authentication.md) | Registration, credentials, cookies, password regeneration, and known limitations |
| [posts-and-feed.md](posts-and-feed.md) | Journal post shapes, composer, drafts, feed ordering, pagination, and polling |
| [discussions-and-reactions.md](discussions-and-reactions.md) | Answers, spoiler concealment, comments, replies, pins, and emoji reactions |
| [courses.md](courses.md) | Course structure, blocks, contributors, publishing, practice progress, and loading |
| [words.md](words.md) | Word cards, word bookmarks, and the Words tab |
| [speech.md](speech.md) | Lesson speech: spoken items, voices, dialogue cast, pronunciation overrides, background generation, and playback |
| [content/index.md](content/index.md) | Course curriculum, storyline, and taught-topic coverage for member-authored Dutch Foundations content |
| [settings-and-administration.md](settings-and-administration.md) | Settings page structure, creator membership administration, and the interactive image cropper |
| [notifications.md](notifications.md) | Notification triggers, read state, retention, and links |
| [profiles-and-settings.md](profiles-and-settings.md) | Required account setup, public identity fields, and account preferences |
| [design-system.md](design-system.md) | Visual language and canonical UI tokens |
| [design-system-plan.md](design-system-plan.md) | Phase 0 design-system implementation tasks, sequencing, and completion criteria |
| [VISUAL-REDESIGN-PLAN.md](../VISUAL-REDESIGN-PLAN.md) | Cross-phase premium visual refresh audit, migration batches, verification, and completion criteria |
| [LESSON_EDITOR_PLAN.md](../LESSON_EDITOR_PLAN.md) | Course lesson editor (C7) delivery steps, status, and release procedure |
| [WORDS_PLAN.md](../WORDS_PLAN.md) | Word cards, bookmarks, and Words tab (C9) delivery steps, status, and release procedure |
| [SPEECH_PLAN.md](../SPEECH_PLAN.md) | Lesson speech (C10) delivery steps, status, and release procedure |
| [architecture.md](architecture.md) | Runtime topology, monorepo boundaries, client/server responsibilities, and API conventions |
| [data-model.md](data-model.md) | Conceptual entities, relationships, constraints, retention, and deletion semantics |
| [security-and-privacy.md](security-and-privacy.md) | Security baseline, privacy boundaries, tradeoffs, and deferred work |
| [testing.md](testing.md) | Test layers, critical scenarios, and release gates |
| [operations.md](operations.md) | Local setup, bootstrap, migrations, deployments, backups, and recovery |
| [roadmap.md](roadmap.md) | Initial delivery phases and unprioritized future backlog |

## Maintenance rule

A change is incomplete until every affected owner document is updated. Create a new focused document when a major feature does not fit an existing owner, then add it to this index and link it from related documents. Update the roadmap whenever scope or completion status changes.
