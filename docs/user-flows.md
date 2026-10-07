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
5. The creator sees a join-request notice and a line on the group home, opens Settings → Members, and accepts or rejects the request.
6. Acceptance makes the group the new user’s landing destination. Rejection leaves the account able to sign in, inspect status, and follow another invitation.
7. Rejected, removed, or departed users may request again later. There is no ban list.

## Returning user and group switching

1. A valid cookie opens the last group stored in that browser when it remains accessible.
2. Otherwise the app chooses an accessible group deterministically.
3. The group switcher in the account menu lists active groups alphabetically and marks the current one.
4. Switching changes the complete tenant context. No content or profile data from another group may remain visible.

## Create a group

1. An accepted user supplies a name, chooses Dutch or German, and optionally chooses an icon, moving and zooming it into a square in the cropper.
2. The creator becomes the first member immediately.
3. The language is immutable. The name and custom icon may change.
4. The group exposes one reusable invitation link to every member.

## Manage a profile and settings

1. A member opens Settings from an active group and lands on the Account page, which states that its fields apply in every group. The creator also sees Group and Members sections; ordinary members see only Account.
2. They may update their display name, optional bio, avatar (chosen through the cropper), and three distinct quick-reaction emoji. Active group attribution reflects the change immediately.
3. They may change their password after entering the current password. A forced password change remains a separate entry flow that does not ask for the current temporary password again.
4. A creator may rename the active group or change its icon on Settings → Group; ordinary members are sent back to Account and the API rejects direct attempts.
5. Any current member may follow a group-scoped profile link. The page shows fallback initials, the group-visible bio, and the post-list area without exposing email or other groups.

## Create a post

1. The member taps the feed's "Write something…" prompt row or the floating create button shown after it scrolls away.
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

The Members directory shows active and former members to everyone. The creator removes members and regenerates passwords on Settings → Members, which also lists pending and rejected requests. Removal requires confirmation. Password regeneration shows one temporary password once for out-of-band sharing; the member must replace it on their next authenticated interaction.

## Review notifications

1. A current member opens Notices inside an active group; no notification request runs in the background.
2. Unread and read events are visually distinct. The member may mark one event or every unread event in that group read.
3. Post, answer, reply, pin, and reaction events link to the most specific surviving destination. A direct answer/reply link reveals the concealed discussion and scrolls to that item.
4. A deleted post/comment leaves the event in place with “Content no longer available.”
5. A rejected or removed person with no active group sees the relevant decision on the restricted status screen, without gaining group access.

## Delete and restore a group

1. On Settings → Group, the creator confirms a destructive-looking but recoverable delete action.
2. The group becomes inaccessible and inactive; members see that it was deleted.
3. The creator sees it under Deleted groups on the Account settings page.
4. Restoration reactivates the group, its content, and all prior memberships.

If a deleted group is a person’s only group, status appears in the restricted landing experience. If another active group remains, deleted status appears in Settings. Only creator-owned deleted groups show Restore.

## Create and publish a course

1. A member opens Courses from the main navigation and chooses New course.
2. They enter a title and summary, plus an optional free-text level and intended learner, and create a draft.
3. The draft opens on its course page. Only the owner and accepted contributors can see it; it does not appear in other members' libraries.
4. The owner can edit the details and upload, replace, or remove a wide cover image.
5. Publishing makes the course visible to every active member in the newest-first library. The first publication also adds a course card to the top of the feed, where members can react, comment, and follow the link to the course. The owner can return it to draft at any time.
6. The owner or group creator can archive the course after confirming. Other members no longer see it, and its feed card says the course is unavailable. The owner and creator still see it in the library and can restore it, which returns it as a draft.

7. The owner adds lessons with a title and optional goal. New lessons are unpublished and appear in the outline with an Unpublished label.
8. Inside a lesson, the owner writes in a block editor: headings, paragraphs, lists, callouts, images, columns, examples, dialogues, and practices, added from the slash menu and moved by dragging. The owner can also move lessons up or down.
9. The editor autosaves the lesson's draft. Readers see only the published version until the owner chooses Publish; Discard returns the draft to the published version, and Unpublish hides the lesson. An edit that has not reached the server yet stays in the browser and reopens on the next visit.
10. If someone saved a newer version first, the editor merges the two by block and says so. Blocks both people changed are shown side by side, and the author keeps the newer version or their own edit for each. See [drafts and publishing](courses.md#drafts-and-publishing).
11. Readers see the outline and the first three lessons, and continue to later lessons one at a time.

## Contribute to a course

1. A member reading a published course chooses Ask to contribute in the Contributors panel. The panel then says the request is waiting, and they can withdraw it.
2. The owner gets a notification that links to the course. The Contributors panel lists pending requests, and the owner accepts or declines each one. The requester is notified of the decision.
3. An accepted contributor sees unpublished lessons, every lesson's draft, and the draft course itself if the owner returns it to draft. They add lessons and edit the draft of any lesson, including a published one, while readers keep seeing the published version. The editor has no Publish, Discard, or Unpublish for them.
4. Reordering, deleting, publishing, and a published lesson's title and goal are left to the owner.
5. The owner sees who last edited each lesson, reviews the draft, and publishes it.
6. A contributor can stop contributing at any time, and the owner can remove a contributor after confirming. Either way their content stays, and they may ask again later. Leaving the group also ends their contributor role.

## Practise a lesson

1. A member reads a published lesson. A practice block shows its instruction, an optional reading passage, and its numbered prompts. Fill-in prompts show `…` for each blank. Authors' versions and notes are not shown.
2. Below the prompts, the answer thread is concealed and shows only how many answers and replies it holds.
3. The learner fills in one answer set covering every item, leaving any item blank. Unsent answers stay in the browser across visits and sign-out.
4. Publishing the answer set, or choosing to reveal without answering, shows the author's version and item notes as a reference, plus everyone's answer sets in order. Nothing is marked right or wrong.
5. Members reply to an answer set and react to answers and replies. Authors can edit or delete their own answers; the group creator can delete any.
6. Returning to the lesson later starts concealed again.

## Work through a lesson step by step

1. On the course page, a member chooses Start lesson on any lesson with content. A focused player opens with a progress bar and a step counter.
2. Text, callouts, and example sentences arrive one step at a time; an example shows its translation and note.
3. Dialogue lines arrive one after another; earlier lines stay visible.
4. Practice questions are asked one by one with a single answer field. Answers are saved as the same browser draft the lesson view uses. On the last question the learner may share the answer set with the group or keep it private.
5. Back and Next move freely, and each move is saved. If the learner leaves mid-lesson, the course page offers Pick up where you left off and the lesson's action reads Continue lesson; the player reopens at the saved step and offers Start over. After the last step the player shows that the lesson is complete, the learner's course percentage, and a link to the next lesson or back to the course.
6. The finished lesson shows a check in the outline and offers Practise again. The course's Progress panel shows every member's percentage, listed by name; a started lesson counts for the share of its steps already passed.
7. Owners and contributors can run an unpublished lesson as a preview; it does not count toward progress.
