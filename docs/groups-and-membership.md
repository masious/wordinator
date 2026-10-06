# Groups and membership

## Tenant model

A group is the tenant and authorization boundary. Users may share an account across groups, but group-owned resources never cross that boundary. The API must validate active membership for every group-owned read and mutation.

Each group has:

- A stable opaque ID used in URLs
- A required mutable name
- One immutable language: Dutch or German initially
- A default flag icon (🇳🇱 or 🇩🇪) or one custom square image
- One creator
- One persistent reusable invitation token
- Active or soft-deleted status

## Roles

There are two roles only.

### Creator

The creator can rename the group, replace/remove its icon, review join requests, remove members, remove any content, regenerate a current member’s password, and soft-delete or restore the group. The creator cannot leave. Ownership transfer is future work.

### Member

A member can view and participate in the group, view its member directory, copy its invitation link, invite people socially, and leave. Every accepted user, including creators, may create additional groups.

### Course roles

Courses have per-course owner and contributor roles, described in the [courses blueprint](courses.md#contributors-and-publishing). They add no group roles and grant nothing outside their course. The group creator keeps moderation over course content: they may delete any lesson, block, or practice answer and archive or restore any course, but they do not edit another member's course or decide its contributors. Leaving or being removed from the group ends a member's contributor requests and roles in it.

## Invitations and requests

- The invitation URL contains an unguessable token and does not itself grant membership.
- New accounts can be created only in invitation context.
- Following a link creates or resumes the request flow for that group.
- At most one pending request exists for a user/group pair.
- Only the creator accepts or rejects requests.
- Rejection, removal, and leaving are temporary states; the person may request again.
- There is no permanent ban list and no initial token rotation/revocation.

Phase 1 exposes invitations at `/invite/:token`. Registration creates the account and one pending membership in a D1 batch; an already signed-in account can create or resume the same pending request. Creator decisions update only a pending membership in the addressed group. Every `/api/groups/:groupId` route passes through active-membership middleware before its handler, and creator-only mutations add a role check after tenant access is established.

Phase 2 adds creator-only group rename through the same group-scoped middleware. The target language and creator remain immutable. Accepting a request records the account’s current group-visible profile snapshot; active profile edits keep that snapshot current until a later leave or removal freezes it.

Phase 5 adds the group-private directory at `/groups/:groupId/members`. It separates active and former members, links profiles, and lets ordinary members leave after confirmation. It is a social view only: the creator reviews requests, removes active members, and generates a 24-character temporary password (returned once) on the creator-only [Members settings page](settings-and-administration.md#members), which lists pending, active, rejected, and former memberships from `GET /api/groups/:groupId/memberships`. Leaving and removal freeze the profile snapshot and preserve authored content. Reusing the invitation moves a non-active membership back through pending approval.

## Application shell

The signed-in shell uses the opaque group ID in its route, lists active non-deleted groups alphabetically, and stores the last visited accessible group in browser local storage under the account ID. If that group is no longer accessible, the first alphabetical group is selected. The switcher remains in the top bar at every width; wide layouts use top navigation and narrow layouts add fixed bottom navigation.

## Membership lifecycle

Suggested states are `pending`, `active`, `rejected`, `left`, and `removed`. Preserve history rather than overwriting facts needed for status screens. Only `active` grants group access. A restored soft-deleted group reactivates the memberships that were active when it was deleted; subsequent explicit membership states remain unchanged.

When someone ceases to be active:

- Their posts, answers, comments, replies, and reactions remain.
- They cannot read or mutate the group until accepted again.
- Current members can open a limited former-member profile containing the last visible display name, avatar, bio, and that person’s posts in this group.
- Rejoining reconnects the same account and historical content.

## Group deletion

Deletion is soft and indefinite. A deleted group is absent from active switches and cannot create activity. Non-creator members see a deleted status. The creator alone can see and restore it from account settings. Initial scope has no permanent purge UI.

Phase 5 implements deletion by setting `groups.deleted_at` while leaving membership states intact. Group middleware requires `deleted_at IS NULL`, so tenant access stops immediately. Sessions return deleted-group summaries separately: affected active members see status, while only the creator receives a restore control. Restoration clears `deleted_at`, restoring the exact memberships active at deletion without changing explicit non-active states.
