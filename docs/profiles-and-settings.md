# Profiles and settings

## Current account setup

Open registration is followed by a required first-use setup screen. A unique username is required; an avatar is optional. The avatar preview carries an overlaid circular edit button so upload is inviting without being presented as mandatory. Until setup completes, the router returns the account to `/` and protected course access is refused.

The current settings destination is `/settings`. It is account-wide and contains profile, avatar, password, theme, and appearance controls, and since C14 a Tutor section and, for a superuser, a link to analytics; see [settings and administration](settings-and-administration.md#current-settings-page).

### Avatar editor

Setup and Settings share one `AvatarEditor`: the avatar with a round edit button on its corner. With no photo, the button ("Choose a profile photo") opens the file picker directly. With a photo, the button ("Change profile photo") opens a menu with Upload new photo and Remove photo. Choosing a file opens the [cropper](settings-and-administration.md#image-cropper), and the save happens right away, separate from any form's submit button. The note that images are public by URL appears in the cropper dialog, where the person commits to the upload, not on the page.

In Settings the profile card starts with an identity header: the avatar editor, the display name, and a muted `@username · email` line, above a separator. Email is shown as text here, not as a disabled field. The form below holds display name, bio, and quick reactions; quick reactions are a plain fieldset (legend and help) without a nested panel. Profile pages are [retired](#profile-pages-retired).

## Profile pages (retired)

Group-private profile pages (`/groups/:groupId/members/:userId`, with current and former-member views and the person's posts in that group) were retired with groups on 2026-10-10; the web redirects those routes to `/courses`, and there is no other profile page. People appear only through bylines (display name, `@username`, and avatar) on posts, comments, contributor lists, and lesson editor attribution. Email and quick reactions are never shown to others. The API's `GET /api/groups/:groupId/members/:userId` remains as a compatibility endpoint with no screen, and membership rows still keep a display-name, bio, and avatar snapshot that profile updates refresh; both go with the compatibility layer.

## Account settings

Users may change:

- Display name; historical attribution updates immediately
- Avatar
- Bio
- Password, after providing the current password unless in the forced-change flow
- Three unique account-wide quick reactions

Email cannot be changed. There is no account deletion, notification preference, session/device management, or manual interface-language setting initially.

Account controls live on `/settings`; every old `/groups/:groupId/settings/...` route redirects there. [Settings and administration](settings-and-administration.md) owns the page's layout. Display names are 1–80 trimmed characters and bios are optional plain text up to 500 trimmed characters. A profile update also refreshes the snapshot in every active membership, so current attribution changes immediately while a later departure can preserve the last visible values.

Quick reactions must be three distinct, single Unicode emoji graphemes. The initial defaults are 👍, ❤️, and 😂. Settings accept emoji sequences such as skin-tone or joined emoji and reject ordinary text, multiple graphemes, and duplicates.

An ordinary password change requires the current password and a new password of at least six characters. The forced-change flow remains the only exception to the current-password requirement. Password changes do not revoke stateless sessions.

## Local preferences

The browser keeps these per device, never on the account:

- The `system` / `light` / `dark` theme preference (`wordinator:color-scheme`), chosen under Appearance; the [theme preference contract](design-system.md#theme-preference-contract) owns its behavior.
- The [speech recognizer](words.md#recognizers) choice (`wordinator:speech-recognizer:v1`) and the reveal sound toggle (`wordinator:reveal-sound:v1`).
- Whether the lesson page's New words panel is collapsed (`wordinator:ui:v1:lesson-words-collapsed`).
- Account-scoped local drafts (`wordinator:draft:v1:...`), under the [draft-key rules](posts-and-feed.md#composer-and-drafts); they survive sign-out.

The interface is English only; future localization is an account or browser choice, not tied to a library language.

## Images

Crop avatar uploads to a square chosen by the person in the [interactive cropper](settings-and-administration.md#image-cropper). Accept static PNG, JPEG, and WebP up to 1 MB; reject animated formats. Store images in a publicly readable R2 bucket. A person with an object URL can access it without application membership. Delete superseded objects after a successful replacement and delete explicitly removed images.

The browser renders the chosen square to a 512-pixel JPEG (a centered square until the person moves or zooms), while the API independently caps the received file at 1 MB and detects PNG, JPEG, or WebP from bytes. Animated PNG/WebP payloads are rejected. Replacements store the new object, update D1, then delete the superseded object; explicit removal clears D1 before object deletion. `/api/media/*` is unauthenticated by design and serves the public R2 object.
