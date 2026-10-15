// Course visibility in SQL (docs/courses.md): published courses, the viewer's own, archived ones for the library creator, and
// drafts the viewer actively contributes to. Course alias `c`.

// For group-scoped routes, which already know the library creator.
export function courseVisibleClause(userId: string, creatorUserId: string) {
  return {
    sql: `(c.status = 'published' OR c.owner_id = ? OR (c.status = 'archived' AND ? = ?)
    OR (c.status = 'draft' AND EXISTS (SELECT 1 FROM course_contributors cc WHERE cc.course_id = c.id AND cc.user_id = ? AND cc.state = 'active')))`,
    values: [userId, userId, creatorUserId, userId],
  };
}

// For account-level reads (the AI tutor): the same rule with the creator read from the course's library, alias `g`, and the
// viewer's active membership of a library that is not deleted. Join with `READABLE_LIBRARY_JOIN`.
export const READABLE_LIBRARY_JOIN = `JOIN groups g ON g.id = c.group_id AND g.deleted_at IS NULL
  JOIN memberships vm ON vm.group_id = c.group_id AND vm.user_id = ? AND vm.state = 'active'`;
export function courseVisibleInLibraryClause(userId: string) {
  return {
    sql: `(c.status = 'published' OR c.owner_id = ? OR (c.status = 'archived' AND g.creator_user_id = ?)
    OR (c.status = 'draft' AND EXISTS (SELECT 1 FROM course_contributors cc WHERE cc.course_id = c.id AND cc.user_id = ? AND cc.state = 'active')))`,
    values: [userId, userId, userId],
  };
}
