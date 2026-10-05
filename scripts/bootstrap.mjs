import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const args = new Set(process.argv.slice(2));
const local = args.has("--local");
const remote = args.has("--remote");
if (local === remote || args.size !== 1) {
  console.error("Usage: pnpm bootstrap --local | pnpm bootstrap --remote");
  process.exit(1);
}

const target = local ? "--local" : "--remote";
const apiDirectory = resolve("apps/api");

function runWrangler(extraArgs, capture = false, exitOnFailure = true) {
  const result = spawnSync("pnpm", ["exec", "wrangler", "d1", "execute", "wordinator", target, ...extraArgs], {
    cwd: apiDirectory,
    encoding: "utf8",
    stdio: capture ? "pipe" : "inherit",
  });
  if (result.status !== 0) {
    if (capture && result.stderr) console.error(result.stderr.trim());
    if (exitOnFailure) process.exit(result.status ?? 1);
    return null;
  }
  return result.stdout ?? "";
}
function sql(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function hiddenPrompt(label) {
  if (!stdin.isTTY) throw new Error("Bootstrap password input requires an interactive terminal.");
  stdout.write(label);
  stdin.setRawMode(true);
  stdin.resume();
  let value = "";
  let finished = false;
  try {
    for await (const chunk of stdin) {
      for (const character of chunk.toString()) {
        if (character === "\r" || character === "\n") { finished = true; break; }
        if (character === "\u0003") process.exit(130);
        if (character === "\u007f") value = value.slice(0, -1);
        else value += character;
      }
      if (finished) break;
    }
  } finally {
    stdin.setRawMode(false);
    stdin.pause();
    stdout.write("\n");
  }
  return value;
}

const existingOutput = runWrangler(["--command", "SELECT COUNT(*) AS count FROM users;", "--json"], true);
let existingCount;
try {
  const payload = JSON.parse(existingOutput);
  existingCount = Number(payload[0]?.results?.[0]?.count ?? payload[0]?.result?.[0]?.results?.[0]?.count);
} catch {
  console.error("Could not read the bootstrap state from Wrangler.");
  process.exit(1);
}
if (!Number.isFinite(existingCount) || existingCount > 0) {
  console.error(existingCount > 0 ? "Bootstrap has already been completed for this target." : "Could not verify bootstrap state.");
  process.exit(1);
}

const prompt = createInterface({ input: stdin, output: stdout });
const email = (await prompt.question("First user email: ")).trim();
const displayName = (await prompt.question("Display name: ")).trim();
const groupName = (await prompt.question("First group name: ")).trim();
const languageInput = (await prompt.question("Target language (Dutch/German): ")).trim().toLowerCase();
prompt.close();
const password = await hiddenPrompt("Password (hidden): ");

const language = languageInput === "dutch" || languageInput === "nl" ? "nl"
  : languageInput === "german" || languageInput === "de" ? "de" : null;
if (!/^\S+@\S+\.\S+$/.test(email) || !displayName || !groupName || !language || password.length < 6) {
  console.error("Enter a valid email, non-empty names, Dutch/German, and a password of at least 6 characters.");
  process.exit(1);
}

const salt = randomBytes(16);
const passwordHash = `pbkdf2_sha256$210000$${salt.toString("base64url")}$${pbkdf2Sync(password, salt, 210_000, 32, "sha256").toString("base64url")}`;
const userId = randomUUID();
const groupId = randomUUID();
const invitationToken = randomBytes(32).toString("base64url");
const now = Date.now();
const statements = `INSERT INTO users (id, email, normalized_email, password_hash, display_name, quick_reaction_one, quick_reaction_two, quick_reaction_three, must_change_password, created_at, updated_at)
VALUES (${sql(userId)}, ${sql(email)}, ${sql(email.toLowerCase())}, ${sql(passwordHash)}, ${sql(displayName)}, char(128077), char(10084, 65039), char(128514), 0, ${now}, ${now});
INSERT INTO groups (id, creator_user_id, name, language, invitation_token, created_at, updated_at)
VALUES (${sql(groupId)}, ${sql(userId)}, ${sql(groupName)}, ${sql(language)}, ${sql(invitationToken)}, ${now}, ${now});
INSERT INTO memberships (group_id, user_id, state, requested_at, decided_at, profile_display_name, updated_at)
VALUES (${sql(groupId)}, ${sql(userId)}, 'active', ${now}, ${now}, ${sql(displayName)}, ${now});`;

const temporaryDirectory = mkdtempSync(join(tmpdir(), "wordinator-bootstrap-"));
const sqlFile = join(temporaryDirectory, "bootstrap.sql");
let completed = false;
try {
  writeFileSync(sqlFile, statements, { mode: 0o600 });
  completed = runWrangler(["--file", sqlFile], false, false) !== null;
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

if (!completed) {
  const cleanup = `DELETE FROM memberships WHERE group_id = ${sql(groupId)} AND user_id = ${sql(userId)}; DELETE FROM groups WHERE id = ${sql(groupId)}; DELETE FROM users WHERE id = ${sql(userId)};`;
  runWrangler(["--command", cleanup], false, false);
  console.error("Bootstrap failed; any records created by this attempt were removed.");
  process.exit(1);
}

console.log(`Bootstrap complete for ${local ? "local" : "remote"}. Group ID: ${groupId}`);
console.log(`Invitation path: /invite/${invitationToken}`);
