# Product requirements

## Release definition

The first usable release is an installable, connectivity-required responsive web application for current Chrome and Safari on desktop and mobile. It serves one private installation and supports Dutch and German groups.

## Required capabilities

- Invitation-originated email/password registration and group approval
- Multiple isolated groups per account, one immutable language per group
- Group creation by any user with at least one accepted membership
- Strict reverse-chronological feed with five post types, one of which (course) is system-created
- Dedicated post pages, spoiler-safe answers, comments, one-level replies, pins, and emoji reactions
- Group-private member directory and profiles
- Member-authored group courses (see [roadmap course phases](roadmap.md#course-phases))
- Group-scoped, on-demand in-app notifications
- Local browser drafts for every writing flow
- Creator moderation, membership management, password regeneration, and recoverable group deletion
- Responsive warm editorial design and an English localization catalog
- Installable PWA metadata with an internet-required offline fallback
- Manual local/production setup, migration, deployment, backup, and restore procedures

## Global content rules

- All learning content is socially expected to use the active group’s target language. The application does not detect or enforce it.
- User-generated content is plain text. Preserve line breaks and auto-link only `http`/`https` URLs. The one exception is course lessons, which use a restricted rich-text document owned by [courses](courses.md#lesson-documents): bold, italic, a fixed text palette, and `http`/`https` links only.
- Optional notes exist on every post type, are hidden by default, and return to hidden on each visit.
- Content limits are generous safeguards rather than learning constraints.
- Activity is attributed; there is no anonymous mode.

## Global interaction rules

- The group is the full social boundary.
- The feed has no ranking, search, filter, or pinned posts.
- Multiple answers and comments by the same member are allowed.
- Authors may interact with their own content.
- Edits are unrestricted and display an edited marker.
- Relative timestamps are primary; exact browser-local time is available on hover or focus.

## Initial exclusions

The release excludes email verification, self-service password recovery, account deletion, a global admin UI, session management, ownership transfer, invite-link rotation, reports, blocking, muting, search, dark mode, formal accessibility conformance, offline application behavior, push/email notifications, notification badges, CI/CD, and automated backups.

## Acceptance summary

The release is ready when the critical flows in [user-flows.md](user-flows.md) work in current Chrome and Safari, tenant isolation tests pass, both applications type-check/test/build, a clean installation can be bootstrapped and deployed from the documentation, and the ten-person group can begin real daily use.

