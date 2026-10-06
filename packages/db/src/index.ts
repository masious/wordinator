import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export { courses, fillExpectedAnswers, groups, loginAttempts, memberships, notifications, platformMetadata, posts, readingQuestions, users } from "./schema";

export function createDatabase(binding: D1Database) {
  return drizzle(binding, { schema });
}

export type Database = ReturnType<typeof createDatabase>;
