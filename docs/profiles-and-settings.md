# Profiles and settings

## Group-private profile

A profile is visible only to current members of a shared active group. The route includes group context and an opaque user ID. It shows:

- Current display name
- Avatar or fallback initials
- Optional bio
- That person’s reverse-chronological posts from the current group only

Never reveal email addresses or other group memberships. There are no platform-public profiles.

When an author is no longer active, current members may open a limited “Former member” profile with the same group-scoped historical information. It does not grant the former member access.

Phase 2 serves profiles at `/groups/:groupId/members/:userId`. The API first proves that the viewer is an active member of the addressed group, then accepts only a target membership that is active, left, or removed in that same group. Active profiles read current account fields. Membership rows retain the last group-visible display name, bio, and avatar key so a former profile does not reveal later account changes. Email and quick reactions are never returned by the profile endpoint.

The profile page includes the reverse-chronological post-list region, loading state, and empty state. Its response is intentionally empty in Phase 2; Phase 3 owns the post schema, cursor data, and populated list.

## Account settings

Users may change:

- Display name; historical attribution updates immediately
- Avatar
- Bio
- Password, after providing the current password unless in the forced-change flow
- Three unique account-wide quick reactions

Email cannot be changed. There is no account deletion, notification preference, session/device management, dark mode, or manual interface-language setting initially.

Phase 2 exposes account and current-group controls at `/groups/:groupId/settings`. Display names are 1–80 trimmed characters and bios are optional plain text up to 500 trimmed characters. A profile update also refreshes the snapshot in every active membership, so current attribution changes immediately while a later departure can preserve the last visible values.

Quick reactions must be three distinct, single Unicode emoji graphemes. The initial defaults are 👍, ❤️, and 😂. Settings accept emoji sequences such as skin-tone or joined emoji and reject ordinary text, multiple graphemes, and duplicates.

An ordinary password change requires the current password and a new password of at least six characters. The forced-change flow remains the only exception to the current-password requirement. Password changes do not revoke stateless sessions.

## Local preferences

The browser stores the last visited accessible group and account/group-scoped drafts. Group switcher order remains alphabetical to avoid additional recency state. Future localization follows the active group language immediately rather than a personal preference.

## Images

Crop avatar and group-icon uploads to a square. Accept static PNG, JPEG, and WebP up to 1 MB; reject animated formats. Store images in a publicly readable R2 bucket. A person with an object URL can access it without application membership. Delete superseded objects after a successful replacement and delete explicitly removed images.

Phase 5 performs a centered square crop to a 512-pixel JPEG in the browser, while the API independently caps the received file at 1 MB and detects PNG, JPEG, or WebP from bytes. Animated PNG/WebP payloads are rejected. Avatar changes update snapshots only for active memberships. Replacements store the new object, update D1, then delete the superseded object; explicit removal clears D1 before object deletion. `/api/media/*` is unauthenticated by design and serves the public R2 object.
