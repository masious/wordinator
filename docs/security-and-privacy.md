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
- Render course lesson documents with Wordinator's own renderer from contract-validated JSON, never with editor-produced HTML; the contracts reject any style, block, or link outside the [lesson document](courses.md#lesson-documents) subset.
- Serve client assets such as fonts and emoji data from Wordinator's own origin; the web app makes no third-party CDN requests.
- Validate image type from content, not filename alone; cap source uploads at 1 MB and reject animation.
- Avoid secrets and authored bodies in logs.

## Tenant and profile privacy

Only active group members can read a group, its directory, profiles, posts, discussions, reactions, and normal notifications. Profile routes reveal no email or other memberships. Former-member profiles are visible only inside the group whose history they explain.

Former-member profile fields come from the membership’s last group-visible snapshot rather than the account’s current fields. Active profile changes refresh snapshots only for active memberships, preventing former groups from learning later display-name, bio, or avatar changes.

Course progress is visible to every member who can see the course: each active member's finished-lesson count and percentage are shown by name. It reveals only which published lessons were finished, never answers or timing. Former members are not listed.

Answer concealment, for posts and for course practice threads, is spoiler protection, not authorization. Practice authors' versions and item notes are left out of learner block payloads and are delivered with the practice thread to any member who can read the practice and reveals it. Their concealment never protects them from a member.

R2 objects are an explicit exception: images are public-by-URL. Unguessable keys reduce discovery but are not access control. Document this to users/operators and do not claim image confidentiality.

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
