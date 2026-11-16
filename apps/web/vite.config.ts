import { defineConfig, loadEnv } from "vite";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import brand from "../../config/brand.json";
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
        globPatterns: ["**/*.{js,css,html,png,jpg,svg,webp}"],
        rollupFormat: "iife",
      },
      includeAssets: ["logo.png", "icon.svg"],
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
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-maskable.png",
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
