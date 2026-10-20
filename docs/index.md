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
| [courses.md](courses.md) | Course structure, blocks, contributors, publishing, practice progress and attempts, lesson states, the lesson progress tab and reset, AI practices on the lesson page, and loading |
| [lesson-shares.md](lesson-shares.md) | Sharing examples, dialogues, and practice questions to the journal: snapshots and references, entry points, duplicates, availability, and the shared answer check |
| [words.md](words.md) | Word cards, word bookmarks, the Words tab, the Weak words view, Drill (including spoken answers), word memory and its review log, and stored pronunciation scores |
| [speech.md](speech.md) | Lesson speech: spoken items, voices, dialogue cast, pronunciation overrides, background generation, and playback; on-demand audio for tutor messages |
| [ai-tutor.md](ai-tutor.md) | The AI tutor: entry point, conversations, formatting, tools and their visibility, confirmation, answer components, next lesson, providers and fallback, the daily cap, and prompt-injection rules |
| [tutor-sessions-and-memory.md](tutor-sessions-and-memory.md) | Tutor study plans and the session panel, per-conversation context scope, dated tutor notes, practice topics, tutor words, word observations, personal practices, the reading component, and short prompt references (C14l) |
| [content/index.md](content/index.md) | Course curriculum, storyline, and taught-topic coverage for member-authored Dutch Foundations content |
| [settings-and-administration.md](settings-and-administration.md) | Settings page structure, the Tutor settings section, the superuser flag, analytics and AI settings, retired creator membership administration, and the interactive image cropper |
| [notifications.md](notifications.md) | Notification triggers, read state, retention, and links |
| [profiles-and-settings.md](profiles-and-settings.md) | Required account setup, public identity fields, and account preferences |
| [design-system.md](design-system.md) | Visual language and canonical UI tokens |
| [design-system-plan.md](design-system-plan.md) | Phase 0 design-system implementation tasks, sequencing, and completion criteria |
| [AI_PLAN.md](../AI_PLAN.md) | AI tutor and learning data (C14, including C14l tutor sessions and memory) delivery steps, status, and release procedure |
| [SPEECH_PLAN.md](../SPEECH_PLAN.md) | Lesson speech (C10) delivery steps, status, and release procedure |
| [REDESIGN_PLAN.md](../REDESIGN_PLAN.md) | Lumen visual redesign: batch order, component mapping, open decisions, and status |
| [architecture.md](architecture.md) | Runtime topology, monorepo boundaries, client/server responsibilities, and API conventions |
| [data-model.md](data-model.md) | Conceptual entities, relationships, constraints, retention, and deletion semantics |
| [security-and-privacy.md](security-and-privacy.md) | Security baseline, privacy boundaries, tradeoffs, and deferred work |
| [testing.md](testing.md) | Test layers, required negative cases, critical browser paths, fixture rules, the harness, and release gates |
| [workers-tests-port-exhaustion.md](workers-tests-port-exhaustion.md) | Running the API Workers test suite without exhausting local ports: symptoms, draining, batches, and orphaned runtimes |
| [operations.md](operations.md) | Local setup, bootstrap, migrations, deployments, backups, and recovery |
| [roadmap.md](roadmap.md) | Initial delivery phases and unprioritized future backlog |

Finished delivery plans are deleted once their phase is released; their checklists stay in git history (`WORDS_PLAN.md`, `DRILL_PLAN.md`, `LESSON_SHARES_PLAN.md`, `LESSON_EDITOR_PLAN.md`, `VISUAL-REDESIGN-PLAN.md`, `MOBILE_PLAN.md`). The roadmap records each phase's outcome.

## Maintenance rule

A change is incomplete until every affected owner document is updated. Create a new focused document when a major feature does not fit an existing owner, then add it to this index and link it from related documents. Update the roadmap whenever scope or completion status changes.
