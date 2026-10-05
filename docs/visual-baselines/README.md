# Visual redesign baselines

The `before-*.png` screenshots record representative Wordinator screens before the premium visual migration. They remain historical review references rather than pixel-diff assertions.

The set covers authentication, the `/ui` workbench, and the signed-in journal at `1440 × 1000` and `390 × 844` in Chromium. E2E fixtures supply deterministic account and group data.

Regenerate the set from the repository root with:

```sh
CAPTURE_VISUAL_BASELINES=1 pnpm --filter @wordinator/web exec playwright test e2e/visual-baselines.spec.ts --project=chromium
```

Redesign Batch 7 stabilizes the light-theme component language. Release-blocking Chromium baselines for authentication, `/ui`, and the signed-in journal now live beside `apps/web/e2e/light-theme-gate.spec.ts` in Playwright's snapshot directory. They cover `390px`, `768px`, and `1440px` where appropriate; WebKit runs the same structural, responsive, overflow, and behavioral gates without maintaining a redundant platform pixel set.

Refresh the asserted light-theme set only after an intentional, reviewed visual change:

```sh
pnpm --filter @wordinator/web exec playwright test e2e/light-theme-gate.spec.ts --project=chromium --update-snapshots
```
