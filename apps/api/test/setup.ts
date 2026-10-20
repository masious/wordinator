import { applyD1Migrations, env } from "cloudflare:test";
import { afterEach, inject } from "vitest";
import { settleWorkerRequests } from "./worker";

declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {}
}

await applyD1Migrations(env.DB, inject("migrations"));

afterEach(settleWorkerRequests);
