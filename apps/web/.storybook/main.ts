import type { StorybookConfig } from "@storybook/react-vite";
import type { PluginOption } from "vite";

// Storybook is a local preview of journal post variants (docs/testing.md#storybook). It is not a release gate: it is outside
// `typecheck`, `test`, `build`, and deployment.
const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../stories/**/*.stories.tsx"],
  staticDirs: ["./public"],
  core: { disableTelemetry: true },
  // The app's Vite config is reused, without the service worker and the route generator, which only the app itself needs.
  viteFinal: (vite) => {
    const keep = (plugin: PluginOption): PluginOption => {
      if (Array.isArray(plugin)) return plugin.map(keep).filter(Boolean);
      const name = plugin && typeof plugin === "object" && "name" in plugin ? plugin.name : "";
      return /^(vite-plugin-pwa|tanstack)/.test(name) ? false : plugin;
    };
    return { ...vite, plugins: (vite.plugins ?? []).map(keep) };
  },
};
export default config;
