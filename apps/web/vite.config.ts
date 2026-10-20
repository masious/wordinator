import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// The emoji picker reads Emojibase data from Wordinator's own origin, never from a third-party CDN.
const emojibaseFiles = ["en/data.json", "en/messages.json"];
const emojibaseSource = (file: string) => readFileSync(createRequire(import.meta.url).resolve(`emojibase-data/${file}`));
function selfHostedEmojibase(): Plugin {
  return {
    name: "wordinator-emojibase",
    configureServer(server) {
      server.middlewares.use("/emojibase", (request, response, next) => {
        const file = request.url?.replace(/^\//, "").split("?")[0] ?? "";
        if (!emojibaseFiles.includes(file)) return next();
        response.setHeader("content-type", "application/json");
        response.end(emojibaseSource(file));
      });
    },
    generateBundle() {
      for (const file of emojibaseFiles) this.emitFile({ type: "asset", fileName: `emojibase/${file}`, source: emojibaseSource(file) });
    },
  };
}

// The offline page is served without the app's stylesheets or JavaScript, so tokens.css is inlined into its template at build time.
const offlineTemplate = new URL("./offline/offline.template.html", import.meta.url);
const tokensStylesheet = new URL("./src/tokens.css", import.meta.url);
const offlineSource = () => readFileSync(offlineTemplate, "utf8").replace("/* wordinator:tokens */", () => readFileSync(tokensStylesheet, "utf8"));
function offlinePage(): Plugin {
  return {
    name: "wordinator-offline-page",
    configureServer(server) {
      server.middlewares.use("/offline.html", (_request, response) => {
        response.setHeader("content-type", "text/html; charset=utf-8");
        response.end(offlineSource());
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "offline.html", source: offlineSource() });
    },
  };
}

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    selfHostedEmojibase(),
    offlinePage(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "service-worker.ts",
      injectManifest: { globPatterns: ["offline.html"] },
      manifest: {
        name: "Wordinator",
        short_name: "Wordinator",
        description: "A shared language-learning journal for friends.",
        theme_color: "#f4f3ef",
        background_color: "#f4f3ef",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }
        ]
      }
    })
  ],
  resolve: {
    alias: [{ find: /^\.\/mantineStyles\.css$/, replacement: new URL("./src/organisms/LessonEditor/empty.css", import.meta.url).pathname }],
  },
  server: {
    proxy: {
      "/api": process.env.WORDINATOR_API_ORIGIN ?? "http://localhost:8787"
    }
  }
});
