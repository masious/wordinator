# Product requirements

## Release definition

The current release is an installable, connectivity-required web application for current Chrome and Safari. It serves committed Dutch and German learners who choose the skill they practice (see [what it is](what_is_it.md#who-it-is-for)). It exposes one global course library; courses remain the organizational layer above lessons.

**Desktop first, with a phone equivalent for every UI decision.** Desktop is the primary composition for new work. Every UI decision also specifies its phone equivalent, which ships in the same change (owner decision, 2026-10-16, reversing the earlier plan to discontinue phone support). Existing phone layouts (the slim header with its navigation drawer, and full-screen surfaces) keep working and their `mobile-*` tests keep passing. The [AI tutor](ai-tutor.md) (C14) is built and tested for phones and desktops alike.

## Required capabilities

- Immediate email/password registration with no invitation or approval
- Required first-use account setup with a unique username and an optional avatar
- One global course library with lessons, lesson playback, progress, words, and speech
- Course authoring and publishing (see [roadmap course phases](roadmap.md#course-phases))
- One global journal, the third navigation tab: strict reverse-chronological feed with five post types, one of which (course) is system-created
- Dedicated post pages, spoiler-safe answers, comments, one-level replies, pins, and emoji reactions
- On-demand in-app notifications
- Local browser drafts for every writing flow
- Account profile, password, appearance, and avatar settings
- Desktop-first warm editorial design and an English localization catalog
- A signed-out home page that addresses the target learner and names the skills they can practice
- Progress measurement and interface guidance toward the next useful practice, without competitive mechanics
- Planned (C15): [learning time](learning-time.md) per lesson, practice, and activity, typical lesson and practice times, weekly and monthly activity, a daily goal and streak, and a home dashboard
- Planned (C14): an [AI tutor](ai-tutor.md) at `/ai`, private learning data (word memory, practice and pronunciation attempts), a lesson Progress tab with reset, a Weak words view, AI practices on lesson pages, and a superuser analytics page
- Installable PWA metadata with an internet-required offline fallback
- Manual local/production setup, migration, deployment, backup, and restore procedures

## Global content rules

- A course defines the context for its lessons. The application does not create separate workspaces per language.
- User-generated content is plain text. Preserve line breaks and auto-link only `http`/`https` URLs. The one exception is course lessons, which use a restricted rich-text document owned by [courses](courses.md#lesson-documents): bold, italic, a fixed text palette, and `http`/`https` links only. An example sentence shared to the journal as a [lesson share](lesson-shares.md) keeps that formatting, rendered read-only by the lesson renderer; posts, notes, and comments themselves stay plain text. The second exception is the [AI tutor's](ai-tutor.md#messages-and-formatting) assistant messages (C14), which use a small Markdown subset (bold, italic, lists, inline code, short headings, and `http`/`https` links) rendered without HTML; user messages stay plain text.
- Optional notes exist on every post type, are hidden by default, and return to hidden on each visit.
- Content limits are generous safeguards rather than learning constraints.
- Authored and progress activity is attributed; there is no anonymous mode. [AI practices](courses.md#ai-practices) (C14) are attributed to the AI tutor rather than to the learner who saved them.

## Global interaction rules

- There is no tenant or workspace switcher.
- Everyone with a set-up account shares one journal. The feed has no ranking, search, filter, or pinned posts.
- Multiple answers and comments by the same member are allowed.
- Authors may interact with their own content.
- Edits are unrestricted and display an edited marker.
- Relative timestamps are primary; exact browser-local time is available on hover or focus.

## Initial exclusions

The release excludes phone-only features (features that exist only on phones), gamification (points, rankings, leaderboards, rewards; the personal streak of [learning time](learning-time.md#daily-goal-and-streak) is the exception), email verification, self-service password recovery, account deletion, a global admin UI (the C14 superuser analytics page is read-only apart from the AI settings), session management, reports, blocking, muting, search, formal accessibility conformance, offline application behavior, push/email notifications, notification badges, CI/CD, and automated backups.

## Acceptance summary

The release is ready when the critical flows in [user-flows.md](user-flows.md) work in current desktop Chrome and Safari, authentication and global-resource authorization tests pass, both applications type-check/test/build, and a clean installation can be bootstrapped and deployed from the documentation.

## Section-aware lesson activities

Approved 2026-10-21; implemented in the working tree, not deployed. [Lesson activities](lesson-activities.md) owns the finite, section-aware activity pages, shared generated content and private learner work. Original-dialogue replay is the narrow role-play exception: learner Sofia, selectable English/Dutch cue, held recording, explicit Send and typed fallback. Activities are optional and never change required lesson completion or word fluency.
