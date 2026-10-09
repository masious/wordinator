# Security and privacy

## Trust model

Wordinator serves a known, small circle, but invitation links and the public internet still expose authentication and API endpoints. Friendly users reduce moderation needs; they do not replace input validation, tenant authorization, or credential protection.

## Required baseline

- Enforce membership and group scope on every tenant-owned read/write.
- Test cross-tenant access attempts for IDs, nested resources, media metadata, and notification targets.
- Hash passwords using a reviewed Workers-compatible password hashing implementation with per-password salts.
- Store the cookie-signing secret and other credentials as Wrangler secrets, never source or client configuration.
- Use Secure, HTTP-only, SameSite cookies and same-origin `/api` access.
- Throttle login attempts and return non-enumerating failures.
- Enforce server request-size and field/count limits.
- Parse inputs with shared Zod contracts; never trust client validation.
- Escape authored text. Linkify only validated `http` and `https` URLs and use safe external-link attributes.
- Render course lesson documents with Wordinator's own renderer from contract-validated JSON, never with editor-produced HTML; the contracts reject any style, block, or link outside the [lesson document](courses.md#lesson-documents) subset. The editor repairs pasted content to that subset before saving; the API's contract and image-key checks remain the enforcement.
- Serve client assets such as fonts and emoji data from Wordinator's own origin; the web app makes no third-party CDN requests.
- Validate image type from content, not filename alone; cap source uploads at 1 MB and reject animation.
- Re-encode every image in the browser before upload so original metadata, such as location, never reaches R2. Lesson images follow [lesson images](courses.md#images).
- Avoid secrets and authored bodies in logs.

## Tenant and profile privacy

Only active group members can read a group, its directory, profiles, posts, discussions, reactions, and normal notifications. Profile routes reveal no email or other memberships. Former-member profiles are visible only inside the group whose history they explain.

Former-member profile fields come from the membership’s last group-visible snapshot rather than the account’s current fields. Active profile changes refresh snapshots only for active memberships, preventing former groups from learning later display-name, bio, or avatar changes.

Course progress is visible to every member who can see the course: each active member's finished-lesson count and percentage are shown by name. The percentage includes the share of started lessons a member has passed, so it reveals roughly how far they are, but never which step they are on, their answers, or timing; saved lesson positions are returned only to their own member. Former members are not listed.

Word bookmarks are private to their member: no route returns another member's bookmarks or counts them. A bookmark is readable only while its member is active in the group and can still see the course.

Answer concealment, for posts and for course practice threads, is spoiler protection, not authorization. Practice authors' versions and item notes are left out of learner block payloads and are delivered with the practice thread to any member who can read the practice and reveals it. Their concealment never protects them from a member.

R2 objects are an explicit exception: images are public-by-URL. Unguessable keys reduce discovery but are not access control. Document this to users/operators and do not claim image confidentiality.

### Lesson speech

[Lesson speech](speech.md) (C10; generation, playback, and authoring are implemented) sends the spoken text of lessons (word terms and their IPA, word examples, example sentences, and dialogue turns, from published documents and from drafts) to Microsoft Azure AI Speech in the `germanywestcentral` region. Accepted as a product decision on 2026-10-09: lesson text is member-authored course material, not personal conversation. The fixed voice sample sentences of the cast editor are sent too. Post, comment, practice answer, and profile text is never sent. Clips are stored in R2 under hashed keys and are public-by-URL like images. Because identical text shares one clip across groups, an author can infer from instant audio that some group already used the same sentence with the same voice; this reveals no group, lesson, or person. No route accepts arbitrary text, so members cannot spend the Azure quota on text outside lessons. The Azure key is a Worker secret and is never logged.

## Known accepted limitations

- Six-character minimum passwords are weak by modern public-service standards.
- Email is unverified and has no self-service recovery.
- Any group creator can regenerate a member password and thereby access the entire account.
- Stateless sessions cannot be individually revoked and survive password changes.
- There is no sign-out-all, account deletion, global admin, ban, report, block, mute, or invite rotation.
- Public R2 URLs bypass group membership.

Phase 5 surfaces the public-image warning beside uploads. Media keys use random UUID paths, validation reads signatures rather than extensions, animated PNG/WebP payloads are rejected, and replacement cleanup happens only after D1 points at the new object. These controls do not turn the public URL into authorization.
- Formal accessibility and broader browser assurance are deferred.

These limitations are acceptable only for the initial trusted private deployment. Do not reuse this threat model for a public service.

## Future security direction

Before broadening access, replace creator-controlled password resets, add verified recovery, server-side revocable sessions or token versioning, invite rotation, account deletion/data handling, stronger password policy, abuse controls, and a formal security review.
