import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { argv } from "node:process";
import { pathToFileURL } from "node:url";

// Grants or revokes the superuser flag (C14e, docs/operations.md#superuser-command):
//   pnpm superuser --local|--remote --grant|--revoke <email>
// Exactly one target and one action are required; anything else fails before database access. Never defaults to production.

export const USAGE = "Usage: pnpm superuser --local|--remote --grant|--revoke <email>";

// Pure argument parsing, tested in scripts/superuser.test.mjs. Returns `{ target, grant, email }` or `{ error }`.
export function parseSuperuserArgs(args) {
  const targets = args.filter((arg) => arg === "--local" || arg === "--remote");
  const actions = args.filter((arg) => arg === "--grant" || arg === "--revoke");
  const rest = args.filter((arg) => !targets.includes(arg) && !actions.includes(arg));
  if (targets.length !== 1 || actions.length !== 1 || rest.length !== 1) return { error: USAGE };
  const email = rest[0].trim().toLowerCase();
  if (email.startsWith("-") || !/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email address." };
  return { target: targets[0], grant: actions[0] === "--grant", email };
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

function main() {
  const parsed = parseSuperuserArgs(argv.slice(2));
  if ("error" in parsed) {
    console.error(parsed.error);
    process.exit(1);
  }
  const { target, grant, email } = parsed;
  const apiDirectory = resolve("apps/api");
  const query = (command) => {
    const result = spawnSync("pnpm", ["exec", "wrangler", "d1", "execute", "wordinator", target, "--command", command, "--json"], {
      cwd: apiDirectory, encoding: "utf8", stdio: "pipe",
    });
    if (result.status !== 0) {
      if (result.stderr) console.error(result.stderr.trim());
      process.exit(result.status ?? 1);
    }
    const rows = parseRows(result.stdout ?? "");
    if (!rows) {
      console.error("Could not read the result from Wrangler.");
      process.exit(1);
    }
    return rows;
  };

  const [user] = query(`SELECT id FROM users WHERE normalized_email = ${sql(email)} LIMIT 1;`);
  if (typeof user?.id !== "string") {
    console.error("No user exists with that email address.");
    process.exit(1);
  }
  query(`UPDATE users SET is_superuser = ${grant ? 1 : 0}, updated_at = ${Date.now()} WHERE id = ${sql(user.id)};`);
  const [updated] = query(`SELECT username, is_superuser FROM users WHERE id = ${sql(user.id)};`);
  const name = updated?.username ?? "(no username yet)";
  const state = updated?.is_superuser === 1 ? "superuser" : "not a superuser";
  console.log(`${name} is now ${state} on ${target === "--local" ? "local" : "remote"}.`);
}

if (argv[1] && import.meta.url === pathToFileURL(resolve(argv[1])).href) main();
