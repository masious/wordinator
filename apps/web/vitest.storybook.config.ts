import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { defineConfig } from "vitest/config";

// Separate from jsdom unit tests: axe must measure computed contrast in a real browser.
export default defineConfig({
  plugins: [storybookTest({
    configDir: new URL("./.storybook", import.meta.url).pathname,
    tags: { include: ["a11y"], exclude: [], skip: [] },
    initialGlobals: { colorScheme: process.env.A11Y_SCHEME === "dark" ? "dark" : "light" },
  })],
  resolve: {
    alias: [{ find: /^\.\/mantineStyles\.css$/, replacement: new URL("./src/organisms/LessonEditor/empty.css", import.meta.url).pathname }],
  },
  test: {
    browser: { enabled: true, provider: "playwright", headless: true, instances: [{ browser: "chromium" }] },
  },
});
