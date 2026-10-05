# User flows

## First installation

1. The operator provisions local or production resources.
2. The bootstrap CLI is run with an explicit `--local` or `--remote` target.
3. Interactive prompts collect the first email, password, display name, group name, and Dutch/German target language.
4. The CLI creates the first user as the first group’s creator and reports completion without printing secrets unnecessarily.

## New user joins a group

1. A current member shares the group’s reusable invitation link.
2. A signed-out visitor registers with email, password, and display name. An existing user signs in.
3. The application creates one pending request for that user and group.
4. A user with no active memberships sees only the pending/rejected status experience.
5. The creator accepts or rejects the request.
6. Acceptance makes the group the new user’s landing destination. Rejection leaves the account able to sign in, inspect status, and follow another invitation.
7. Rejected, removed, or departed users may request again later. There is no ban list.

## Returning user and group switching

1. A valid cookie opens the last group stored in that browser when it remains accessible.
2. Otherwise the app chooses an accessible group deterministically.
3. The top-left switcher lists active groups alphabetically.
4. Switching changes the complete tenant context. No content or profile data from another group may remain visible.

## Create a group

1. An accepted user supplies a name, chooses Dutch or German, and optionally uploads/crops a square icon.
2. The creator becomes the first member immediately.
3. The language is immutable. The name and custom icon may change.
4. The group exposes one reusable invitation link to every member.

## Manage a profile and settings

1. A member opens Settings from an active group. Account fields remain account-wide even though the route keeps the current group shell visible.
2. They may update their display name, optional bio, and three distinct quick-reaction emoji. Active group attribution reflects the change immediately.
3. They may change their password after entering the current password. A forced password change remains a separate entry flow that does not ask for the current temporary password again.
4. A creator may rename the active group; ordinary members do not receive that control and the API rejects direct attempts.
5. Any current member may follow a group-scoped profile link. The page shows fallback initials, the group-visible bio, and the post-list area without exposing email or other groups.

## Create a post

1. The member opens the persistent feed composer or the floating button shown after it scrolls away.
2. A centered desktop modal or full-screen mobile composer opens.
3. The post-type chooser appears at the top.
4. Switching type preserves each type’s fields and maps compatible values where sensible; nothing is cleared merely by switching.
5. The browser saves a versioned draft scoped to account and group.
6. Successful publication clears all composer state for that group and places the post at the top on the next feed reconciliation.

## Answer without spoilers

1. An answer-oriented post opens with the answer count visible and the thread concealed.
2. The learner either submits an answer without seeing prior answers or explicitly reveals the thread.
3. Submission publishes a top-level comment and reveals the discussion for the current visit.
4. Returning to the page later starts concealed again.
5. Following a notification to a specific answer deliberately reveals and scrolls to it.

## Complete a reading

1. The detail page presents a wizard with one question per step and visible progress.
2. The learner may leave individual answers blank.
3. Progress is saved locally per account, group, and post.
4. Final submission publishes one answer set containing every question in order; skipped entries read “No answer.”
5. Successful submission clears the reading draft.

## Moderate and leave

- Authors edit or delete their own content. The creator may remove any group content.
- An ordinary member may leave. Their content and limited former-member profile remain.
- The creator may remove a member; that person receives an out-of-group status notice.
- The creator cannot leave in the initial release.

The Members page shows active and former members. Creator removal requires confirmation. Password regeneration shows one temporary password once for out-of-band sharing; the member must replace it on their next authenticated interaction.

## Review notifications

1. A current member opens Notices inside an active group; no notification request runs in the background.
2. Unread and read events are visually distinct. The member may mark one event or every unread event in that group read.
3. Post, answer, reply, pin, and reaction events link to the most specific surviving destination. A direct answer/reply link reveals the concealed discussion and scrolls to that item.
4. A deleted post/comment leaves the event in place with “Content no longer available.”
5. A rejected or removed person with no active group sees the relevant decision on the restricted status screen, without gaining group access.

## Delete and restore a group

1. The creator confirms a destructive-looking but recoverable delete action.
2. The group becomes inaccessible and inactive; members see that it was deleted.
3. The creator sees it under Deleted groups in account settings.
4. Restoration reactivates the group, its content, and all prior memberships.

If a deleted group is a person’s only group, status appears in the restricted landing experience. If another active group remains, deleted status appears in Settings. Only creator-owned deleted groups show Restore.
