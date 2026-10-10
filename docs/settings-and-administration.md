# Settings and administration

> Current scope: only the account settings surface at `/settings` remains in the product shell. Group and member administration below is retired behavior retained as migration history while its compatibility endpoints still exist; every `/groups/$groupId/settings/...` route now redirects to `/settings`.

Status: shipped on 2026-10-06. See the [roadmap](roadmap.md#settings-split).

This document owns how Settings is divided into pages, who sees each page, the creator's membership administration page, and the interactive image cropper. Field rules stay with their current owners: account fields in [profiles-and-settings.md](profiles-and-settings.md), membership states and creator powers in [groups-and-membership.md](groups-and-membership.md), credentials in [authentication.md](authentication.md).

## Why split

Today one page mixes three scopes: account-wide fields that apply in every group, group facts that only the creator may change, and (soon) group membership administration. The split follows scope and audience, not page length.

## Pages

| Page | Route | Scope | Visible to |
| --- | --- | --- | --- |
| Account | `/groups/$groupId/settings/account` | Whole account | Every active member |
| Group | `/groups/$groupId/settings/group` | Addressed group | Creator only |
| Members | `/groups/$groupId/settings/members` | Addressed group | Creator only |

`/groups/$groupId/settings` redirects to the Account page, so existing links and the account utility keep working. All three routes stay inside the group shell, because the app has no group-less authenticated shell.

A settings sub-navigation (Account, Group, Members) appears only for the creator. Ordinary members see the Account page with no sub-navigation. A non-creator who opens a creator-only route directly is redirected to Account. That redirect is a convenience; the API still rejects every creator-only read and mutation.

### Account

- Profile form: email (read-only), display name, bio, avatar, three quick reactions
- Password change
- Theme preference (browser-local)
- Deleted groups, with Restore for creator-owned ones. This stays here because a deleted group's own routes are unreachable, and the list spans groups.

The Account page states plainly that these settings apply in every group.

### Group

- Rename
- Replace or remove the group icon
- Delete the group, inside the existing confirmation-guarded danger zone

The language and creator stay immutable and are shown read-only.

### Members

The creator's single place for membership decisions. It shows four sections in this order:

1. **Pending requests**, oldest request first, each with Accept and Reject.
2. **Active**, alphabetical. Every non-creator row has Remove (with confirmation) and Generate temporary password (shown once). The creator's own row has no actions.
3. **Rejected**, most recent decision first. Read-only. The person may request again through the invitation, which moves the row back to Pending.
4. **Former** (left or removed), most recent decision first, labeled with which of the two happened. Read-only.

Rows show the avatar or initials, display name, and the relevant date: requested for Pending, accepted for Active, decided for Rejected and Former. Never show email or other group memberships.

Names follow the existing snapshot rule. Active rows use current account fields. Left and removed rows use the frozen membership snapshot. Pending and rejected people have no snapshot, so they show their current display name and avatar, as the pending-request panel does today.

Every section has an empty state. The page reads one unpaged response: membership rows are bounded by the people who ever followed one group's invitation, the same assumption the member directory already makes.

## Changes to existing surfaces

- **Member directory** (`/groups/$groupId/members`) becomes a social view only: active and former members with profile links, plus Leave for ordinary members. Remove and Generate temporary password move to the Members settings page.
- **Group home** loses the inline pending-request panel. For the creator, when requests are waiting, it shows one quiet line ("2 join requests waiting") linking to the Members settings page. Members never see it.
- **Join-request notifications** link to the Members settings page instead of the group home.
- **Account utility** still says "Settings" and opens Account.

## Image cropper

Today the browser center-crops every upload automatically, so people cannot choose what part of a photo is kept. Picking an image instead opens a cropper.

- The cropper lives in the shared `ImageUpload` component, so the avatar, group icon, and course cover all get it. Avatar and icon use a fixed square frame, and the cover uses its fixed 2:1 frame. The frame mask matches how the image is displayed.
- It opens in the shared adaptive dialog: centered on desktop, full screen on mobile.
- Drag (mouse, touch, or pen) moves the image. A labeled zoom slider, the mouse wheel, and pinch zoom between 1× and 3×. The image always covers the frame, with no empty edges.
- Keyboard: arrow keys move the image and `+`/`-` zoom, with every control reachable by Tab. Reset returns to the centered fit.
- Save renders the chosen area from the original pixels to the current output (512×512 JPEG for square, 1200×600 for wide) and uploads it through the existing endpoint. Re-encoding still strips metadata, and photo orientation follows the file's EXIF orientation.
- Cancel discards the selection and leaves the current image unchanged. An upload error keeps the dialog open with the selection intact, so the person can retry.
- No API, size-limit, type-check, or R2 cleanup change. The server checks stay as they are.

The cropper uses `react-easy-crop`, styled with its static stylesheet (automatic style injection is disabled) followed by CSS Modules and design tokens. The group-creation form uses the same cropper for its optional icon and uploads the cropped output after the group exists.

## API

- New `GET /api/groups/:groupId/memberships`: active-membership middleware, then creator-only (`403 CREATOR_REQUIRED`). It returns `pending`, `active`, `rejected`, and `former` arrays, validated by a shared contract.
- `GET /api/groups/:groupId` replaces `pendingMembers` with `pendingRequestCount`, which is `0` for non-creators.
- Existing mutations keep their paths and rules: `PATCH /memberships/:userId` (accept/reject pending only), `DELETE /memberships/:userId`, `POST /memberships/:userId/regenerate-password`, group rename, icon, delete, and restore.
- No schema change. `memberships.state`, `requested_at`, `decided_at`, and the profile snapshot already carry everything above.

## Verification

- Workers integration: a member gets `403` from the memberships read; a creator of group A gets the tenant-access rejection for group B; a creator's response contains only the addressed group's rows; each state lands in the correct array with snapshot-versus-current names; email never appears; `pendingRequestCount` is `0` for members.
- Negative authorization stays covered for accept, reject, remove, and regenerate, including a target user ID that belongs to another group.
- React Testing Library: the creator sees the sub-navigation and all three pages; a member sees Account only and is redirected from Group and Members; each Members section renders rows and its empty state; the directory no longer shows creator actions.
- Unit: the crop-area to output-pixel calculation for both frames, including zoom limits and the cover-the-frame clamp.
- React Testing Library: choosing a file opens the cropper; Cancel uploads nothing; Save uploads one file of the expected size; keyboard moving and zooming work; an upload error keeps the dialog open.
- Playwright (Chromium and WebKit): an avatar upload goes through the cropper on desktop and mobile widths. An invited user's request is accepted from Settings → Members; the creator renames the group from Settings → Group; a member edits their profile from Settings → Account; the `/settings` redirect works.
- Type-checking and web plus API production builds.

## Out of scope

Ownership transfer, invitation-link rotation, bans, filtering or searching the member lists, bulk decisions, and any new account setting. The cropper adds no rotation, filters, free aspect ratio, or image editing beyond move and zoom.
