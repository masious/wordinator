import { applyD1Migrations, env } from "cloudflare:test";
import { inject } from "vitest";

declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {}
}

await applyD1Migrations(env.DB, inject("migrations"));
