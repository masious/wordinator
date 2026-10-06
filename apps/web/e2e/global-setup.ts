import { pbkdf2Sync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

export const E2E_INVITATION_TOKEN = "e2e-invitation-token-xxxxxxxxxxxxxxxxxxxxxxxx";
export const E2E_CREATOR_EMAIL = "creator@e2e.test";
export const E2E_PASSWORD = "playwright-password";
export const E2E_GROUP_ID = "20000000-0000-4000-8000-000000000001";

export default function globalSetup() {
  const root = resolve(import.meta.dirname, "../../..");
  const api = join(root, "apps/api");
  const persistencePath = "../../.wrangler/e2e";
  execFileSync("pnpm", ["exec", "wrangler", "d1", "migrations", "apply", "wordinator", "--local", "--persist-to", persistencePath], { cwd: api, stdio: "inherit" });
  const salt = Buffer.alloc(16, 7);
  const passwordHash = `pbkdf2_sha256$40000$${salt.toString("base64url")}$${pbkdf2Sync(E2E_PASSWORD, salt, 210_000, 32, "sha256").toString("base64url")}`;
  const userId = "10000000-0000-4000-8000-000000000001";
  const groupId = E2E_GROUP_ID;
  const now = Date.now();
  const sql = `DELETE FROM reactions;
DELETE FROM post_pins;
DELETE FROM comment_response_items;
DELETE FROM comments;
DELETE FROM reading_questions;
DELETE FROM fill_expected_answers;
DELETE FROM posts;
DELETE FROM login_attempts;
DELETE FROM notifications;
DELETE FROM memberships;
DELETE FROM groups;
DELETE FROM users;
INSERT INTO users (id,email,normalized_email,password_hash,display_name,quick_reaction_one,quick_reaction_two,quick_reaction_three,must_change_password,created_at,updated_at) VALUES ('${userId}','${E2E_CREATOR_EMAIL}','${E2E_CREATOR_EMAIL}','${passwordHash}','Creator',char(128077),char(10084,65039),char(128514),0,${now},${now});
INSERT INTO groups (id,creator_user_id,name,language,invitation_token,created_at,updated_at) VALUES ('${groupId}','${userId}','Alpha Journal','nl','${E2E_INVITATION_TOKEN}',${now},${now});
INSERT INTO memberships (group_id,user_id,state,requested_at,decided_at,profile_display_name,updated_at) VALUES ('${groupId}','${userId}','active',${now},${now},'Creator',${now});`;
  const directory = mkdtempSync(join(tmpdir(), "wordinator-e2e-"));
  const file = join(directory, "fixtures.sql");
  try {
    writeFileSync(file, sql, { mode: 0o600 });
    execFileSync("pnpm", ["exec", "wrangler", "d1", "execute", "wordinator", "--local", "--persist-to", persistencePath, "--file", file], { cwd: api, stdio: "inherit" });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
