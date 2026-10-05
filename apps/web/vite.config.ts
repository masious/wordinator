import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "service-worker.ts",
      injectManifest: { globPatterns: ["offline.html"] },
      manifest: {
        name: "Wordinator",
        short_name: "Wordinator",
        description: "A shared language-learning journal for friends.",
        theme_color: "#F4EBDD",
        background_color: "#F4EBDD",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }
        ]
      }
    })
  ],
  server: {
    proxy: {
      "/api": process.env.WORDINATOR_API_ORIGIN ?? "http://localhost:8787"
    }
  }
});
