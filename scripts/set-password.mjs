import { pbkdf2Sync, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { stdin, stdout } from "node:process";

const [targetArgument, emailArgument, ...extraArguments] = process.argv.slice(2);
const local = targetArgument === "--local";
const remote = targetArgument === "--remote";
if ((!local && !remote) || !emailArgument || extraArguments.length > 0) {
  console.error("Usage: pnpm set-password --local <email> | pnpm set-password --remote <email>");
  process.exit(1);
}

const normalizedEmail = emailArgument.trim().toLowerCase();
if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
  console.error("Enter a valid email address.");
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

function parseRows(output) {
  try {
    const payload = JSON.parse(output);
    return payload[0]?.results ?? payload[0]?.result?.[0]?.results ?? null;
  } catch {
    return null;
  }
}

async function hiddenPrompt(label) {
  if (!stdin.isTTY) throw new Error("Password input requires an interactive terminal.");
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

const lookupOutput = runWrangler([
  "--command",
  `SELECT id FROM users WHERE normalized_email = ${sql(normalizedEmail)} LIMIT 1;`,
  "--json",
], true);
const rows = parseRows(lookupOutput);
if (!rows) {
  console.error("Could not read the user from Wrangler.");
  process.exit(1);
}
if (rows.length === 0 || typeof rows[0]?.id !== "string") {
  console.error("No user exists with that email address.");
  process.exit(1);
}

let password;
try {
  password = await hiddenPrompt("New password (hidden): ");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Could not read the password.");
  process.exit(1);
}
if (password.length < 6) {
  console.error("The password must contain at least 6 characters.");
  process.exit(1);
}

const salt = randomBytes(16);
const passwordHash = `pbkdf2_sha256$210000$${salt.toString("base64url")}$${pbkdf2Sync(password, salt, 210_000, 32, "sha256").toString("base64url")}`;
const statements = `UPDATE users
SET password_hash = ${sql(passwordHash)}, must_change_password = 0, updated_at = ${Date.now()}
WHERE id = ${sql(rows[0].id)};`;

const temporaryDirectory = mkdtempSync(join(tmpdir(), "wordinator-set-password-"));
const sqlFile = join(temporaryDirectory, "set-password.sql");
let completed = false;
try {
  writeFileSync(sqlFile, statements, { mode: 0o600 });
  completed = runWrangler(["--file", sqlFile], false, false) !== null;
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

if (!completed) {
  console.error("Password update failed.");
  process.exit(1);
}

console.log(`Password updated for ${local ? "local" : "remote"}.`);
