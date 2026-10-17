import type { StorybookConfig } from "@storybook/react-vite";
import type { PluginOption } from "vite";

// Storybook previews journal and UI stories locally; its Vitest addon runs the Batch A browser accessibility gate.
const config: StorybookConfig = {
  framework: "@storybook/react-vite",
  stories: ["../stories/**/*.stories.tsx"],
  staticDirs: ["./public"],
  core: { disableTelemetry: true },
  addons: ["@storybook/addon-a11y", "@storybook/addon-vitest"],
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
