# Notifications

> Current scope: notifications open at `/notifications` (Notices in the main navigation) and cover the single library. Membership triggers (join requests and decisions) no longer fire because registration is open; post, answer, reply, pin, reaction, and course triggers remain. Old `/groups/:groupId/notifications` links redirect there.

Notifications are in-app, group-scoped records loaded only when the active group’s Notifications page opens.

## Triggers

Create a notification for the relevant recipient when another person:

- Requests to join a group they created
- Accepts or rejects their request
- Removes them from a group
- Adds a top-level comment/answer to their post
- Replies to their top-level item
- Pins their answer
- Reacts to their post, top-level item, or reply
- Asks to contribute to a course they own
- Accepts or rejects their request to contribute to a course

Do not create notifications for new posts. Do not notify the actor about their own action.

## Presentation

- Show only the active group’s notification records in the normal app.
- Users with no active group use the restricted request/status page for decisions and removals.
- There are no navigation badges, unread counters outside the page, background queries, email, push, or operating-system notifications.
- The page distinguishes read/unread, marks one item read, and marks all loaded/group items read.
- Store events individually. Grouped display is future work.
- Retain records indefinitely.

The implemented page is `/groups/:groupId/notifications`. It is queried only when that route opens; neither the application shell nor the service worker polls it. Each row carries the group, recipient, actor, event kind, optional post/comment destination, optional course destination, creation time, and nullable read time. Mark-one updates require both the current recipient and active group; mark-all affects only unread rows for that recipient in that group.

Acceptance, rejection, and removal records are also available from the authenticated restricted-status endpoint. The restricted landing experience loads that endpoint only when it is shown. This lets a rejected or removed person see the decision without granting access to normal group notifications.

## Navigation and deleted targets

A notification links to the most specific available target. A join request links the creator to the [Members settings page](settings-and-administration.md#members). Contributor notifications link to the course page, where the owner decides pending requests; they show “Content no longer available.” once the course is archived. Direct navigation to an answer or reply reveals a concealed thread and scrolls to the item. If the content was deleted, keep the notification and show “Content no longer available.” A soft-deleted or inaccessible group instead shows its appropriate membership/group status.

Notifications store target IDs without foreign keys to posts, comments, or courses, so target deletion cannot erase history. Availability is resolved at read time inside the recipient and group scope. No authored body, invitation token, email, or credential is copied into a notification.
