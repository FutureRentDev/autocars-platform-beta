import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import brand from "../../config/brand.json";
// Changing the actual icon also changes manifest URLs for installed PWAs.
const iconRevision = createHash("sha256")
  .update(readFileSync(new URL("./public/icon-512.png", import.meta.url)))
  .digest("hex")
  .slice(0, 12);
const iconUrl = (name: string) =>
  `/brand-icons/${name.replace(/(\.[a-z]+)$/, `.${iconRevision}$1`)}`;
const apiPort =
  process.env.PORT ||
  loadEnv("development", fileURLToPath(new URL("../../", import.meta.url)), "")
    .PORT ||
  "4000";
const apiTarget = `http://127.0.0.1:${apiPort}`;
export default defineConfig({
  plugins: [
    {
      name: "brand-html",
      transformIndexHtml(html) {
        return html
          .replace(
            "Find your next car with AutoCars.",
            `Find your next car with ${brand.name}.`,
          )
          .replace(
            /<title>.*?<\/title>/,
            `<title>${brand.name} — ${brand.tagline}</title>`,
          )
          .replace(
            /href="\/(favicon\.(?:png|ico)|apple-touch-icon\.png)"/g,
            (_, name: string) => `href="${iconUrl(name)}"`,
          );
      },
    },
    react(),
    VitePWA({
      registerType: "prompt",
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectRegister: null,
      devOptions: {
        enabled: true,
        type: "module",
        navigateFallback: "index.html",
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,png,jpg,svg,webp,ico}"],
        rollupFormat: "iife",
      },
      includeAssets: [
        "logo.png",
        "icon.svg",
        "apple-touch-icon.png",
        "badge.png",
        "favicon.png",
        "favicon.ico",
      ],
      manifest: {
        id: "/",
        scope: "/",
        lang: brand.locale,
        prefer_related_applications: false,
        categories: ["shopping", "lifestyle"],
        name: brand.name,
        short_name: brand.name,
        description: brand.tagline,
        theme_color: brand.background,
        background_color: brand.background,
        display: "standalone",
        start_url: "/",
        icons: [
          { src: iconUrl("icon-192.png"), sizes: "192x192", type: "image/png" },
          {
            src: iconUrl("icon-512.png"),
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: iconUrl("icon-maskable.png"),
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      "/api": { target: apiTarget, ws: true },
      "/uploads": apiTarget,
    },
  },
});
