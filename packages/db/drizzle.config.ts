import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

// Local D1 database written by `wrangler dev` / `pnpm db:migrate:local`.
// Studio only ever opens this local file; remote D1 is never targeted here.
const localD1Dir = resolve(process.cwd(), "../../apps/api/.wrangler/state/v3/d1/miniflare-D1DatabaseObject");

function findLocalD1(): string | undefined {
  if (!existsSync(localD1Dir)) return undefined;
  return readdirSync(localD1Dir)
    .filter((name) => name.endsWith(".sqlite"))
    .map((name) => join(localD1Dir, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

const localD1 = findLocalD1();

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema.ts",
  out: "./migrations",
  ...(localD1 ? { dbCredentials: { url: localD1 } } : {}),
});
