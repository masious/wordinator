# Retired groups and membership model

Groups, workspaces, language tenants, invitation links, join requests, approval queues, member directories, membership administration, group switching, and group deletion are no longer product concepts.

The active product has one global course library. Registration is open and immediately creates an active account. Required account setup, not membership approval, is the only gate before the library.

## Storage compatibility

Course and lesson tables still carry historical `group_id` columns while existing installations are migrated without rewriting their authored lesson documents, media, progress, bookmarks, or speech jobs in one destructive operation. New registrations receive an active row for the installation's oldest active library record so the existing course API can read that data. The web never exposes this record as a group, tenant, switcher, invitation, or URL segment.

New product work must not depend on multiple groups or membership lifecycle states. The compatibility columns and retired endpoints are scheduled for removal after production data has been verified under the global routes.
