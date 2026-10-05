import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

const migrations = await readD1Migrations("../../packages/db/migrations");

export default defineWorkersConfig({
  test: {
    include: ["test/phase-five-media.test.ts"],
    setupFiles: ["./test/setup.ts"],
    provide: { migrations },
    poolOptions: {
      workers: {
        main: "./src/index.ts",
        // Work around the 0.8 pool's macOS R2 SQLite-sidecar isolation bug; this config runs one media suite only.
        isolatedStorage: false,
        singleWorker: true,
        miniflare: {
          compatibilityDate: "2025-09-06",
          d1Databases: ["DB"],
          r2Buckets: ["MEDIA"],
          bindings: { COOKIE_SIGNING_SECRET: "test-only-cookie-signing-secret-with-32-characters", PUBLIC_MEDIA_BASE_URL: "https://wordinator.test/api/media" },
        },
      },
    },
  },
});

declare module "vitest" {
  export interface ProvidedContext { migrations: typeof migrations }
}
