# Authentication

The initial authentication model is deliberately small and suitable only for this trusted private deployment.

## Registration

- Registration must originate from a valid group invitation.
- Required fields are email, password, and display name.
- Normalize email for case-insensitive uniqueness while retaining a display-safe form if desired.
- Email verification and email changes are unavailable.
- Passwords require at least six characters. There are no composition rules or scheduled expiration.
- A registered account with no accepted membership can sign in only to the request-status experience.

## Password storage

Store only a salted, computationally expensive password hash using a reviewed Cloudflare Workers-compatible implementation. Algorithm parameters belong in code and must support future rehash-on-login upgrades. Never log credentials or include them in analytics or operational context.

The Phase 1 implementation uses Workers Web Crypto PBKDF2-HMAC-SHA-256 with a random 16-byte salt, a 256-bit result, and 210,000 iterations. The encoded hash includes its algorithm and iteration count so a later successful login can support parameter upgrades without a schema change.

## Sessions

- Use a secure, HTTP-only, SameSite cookie signed with a secret stored through Wrangler secrets.
- The cookie is stateless and has a 30-day sliding expiry.
- It identifies the account and expiry; current authorization facts are loaded server-side.
- There is no device/session list, current-session revocation, or sign-out-all.
- Current-session sign-out expires the browser cookie.

Production HTTPS cookies always use `Secure`. Wrangler's HTTP-only local development origin omits `Secure` because browsers otherwise discard the cookie; all other cookie properties and signing behavior are identical.

Do not create a session table while this model remains in force. Changing the password or regenerating it does not invalidate already issued cookies.

Phase 2 uses the same password-change endpoint for forced and ordinary changes. An ordinary signed-in change must include and successfully verify the current password; a forced change may omit it because the temporary credential was already used to establish the session. Both paths enforce the shared password contract, replace the PBKDF2 hash, clear `must_change_password`, and leave existing stateless cookies valid by design.

## Creator-generated password

A creator may regenerate a password for any current member of their group. This means a creator can gain access to the member’s entire account, including other groups; the product knowingly accepts this risk temporarily.

1. Generate a strong temporary password server-side.
2. Store its password hash and set `must_change_password`.
3. Display the temporary password to the creator exactly once for out-of-band sharing.
4. Existing sessions remain valid, but authenticated requests route the member to a required password-change flow.
5. Successful change clears the flag.

Phase 5 exposes regeneration only to the creator of a shared active group and only for a currently active target membership. The API generates 24 random characters, stores only the PBKDF2 hash, sets `must_change_password`, and returns plaintext once. Already-issued stateless cookies remain valid, but the next authenticated request reloads the forced-change flag and restricts the account to changing the password.

## Throttling

Throttle login attempts without exposing whether an email exists. Apply request-size limits throughout the API. More advanced rate limiting, CAPTCHA, email recovery, verification, and replacement authentication are future work.

Phase 1 stores login-failure windows in D1 under a SHA-256 key derived from the client address and normalized email. Five failures within 15 minutes block the next attempt until that window expires. Unknown and known email addresses execute password verification and return the same invalid-credentials response. JSON request bodies are capped at 16 KiB, with an early `Content-Length` rejection when that header is available.
