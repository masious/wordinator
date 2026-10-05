# Wordinator

Private, self-hosted social language learning for a small group of friends.

## Local development

Requires Node.js 20.19+ and pnpm 10.15+.

```sh
pnpm install
cp apps/api/.dev.vars.example apps/api/.dev.vars
pnpm db:migrate:local
pnpm bootstrap --local
pnpm dev
```

Replace the example cookie secret before starting the apps, then open `http://localhost:5173` and sign in with the bootstrap account. See [docs/index.md](docs/index.md) for the product specification and [docs/operations.md](docs/operations.md) for all supported commands and environment notes.

## Verify

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```
