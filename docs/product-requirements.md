# Product requirements

## Release definition

The current release is an installable, connectivity-required responsive web application for current Chrome and Safari on desktop and mobile. It exposes one global course library; courses remain the organizational layer above lessons.

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
- Responsive warm editorial design and an English localization catalog
- Installable PWA metadata with an internet-required offline fallback
- Manual local/production setup, migration, deployment, backup, and restore procedures

## Global content rules

- A course defines the context for its lessons. The application does not create separate workspaces per language.
- User-generated content is plain text. Preserve line breaks and auto-link only `http`/`https` URLs. The one exception is course lessons, which use a restricted rich-text document owned by [courses](courses.md#lesson-documents): bold, italic, a fixed text palette, and `http`/`https` links only.
- Optional notes exist on every post type, are hidden by default, and return to hidden on each visit.
- Content limits are generous safeguards rather than learning constraints.
- Authored and progress activity is attributed; there is no anonymous mode.

## Global interaction rules

- There is no tenant or workspace switcher.
- Everyone with a set-up account shares one journal. The feed has no ranking, search, filter, or pinned posts.
- Multiple answers and comments by the same member are allowed.
- Authors may interact with their own content.
- Edits are unrestricted and display an edited marker.
- Relative timestamps are primary; exact browser-local time is available on hover or focus.

## Initial exclusions

The release excludes email verification, self-service password recovery, account deletion, a global admin UI, session management, reports, blocking, muting, search, formal accessibility conformance, offline application behavior, push/email notifications, notification badges, CI/CD, and automated backups.

## Acceptance summary

The release is ready when the critical flows in [user-flows.md](user-flows.md) work in current Chrome and Safari, authentication and global-resource authorization tests pass, both applications type-check/test/build, and a clean installation can be bootstrapped and deployed from the documentation.
