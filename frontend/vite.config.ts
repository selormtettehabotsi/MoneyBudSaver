import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.svg",
        "icon-192.png",
        "icon-512.png",
        "icon-512-maskable.png",
        "apple-touch-icon.png",
      ],
      manifest: {
        id: "/",
        name: "MoneyCouncil",
        short_name: "MoneyCouncil",
        description:
          "Privacy-First Multi-AI Ensemble Financial Advisor & Budget Tracker",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait-primary",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        cacheId: "moneycouncil-shell-v1",
        cleanupOutdatedCaches: true,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/health/, /^\/internal/],
        runtimeCaching: [
          {
            // NEVER cache API requests in Service Worker (NetworkOnly for /api/*)
            urlPattern: ({ url }) => url.pathname.startsWith("/api/"),
            handler: "NetworkOnly",
          },
          {
            // Exclude health checks from caching
            urlPattern: ({ url }) => url.pathname.startsWith("/health"),
            handler: "NetworkOnly",
          },
          {
            // Immutable caching for hashed static JS/CSS assets
            urlPattern: ({ request }) =>
              request.destination === "style" ||
              request.destination === "script" ||
              request.destination === "worker",
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "moneycouncil-static-assets",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
              },
            },
          },
          {
            // Cache static images and fonts
            urlPattern: ({ request }) =>
              request.destination === "image" ||
              request.destination === "font",
            handler: "CacheFirst",
            options: {
              cacheName: "moneycouncil-media",
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 24 * 60 * 60, // 60 days
              },
            },
          },
        ],
      },
    }),
  ],
  esbuild: {
    // Strips console.log and debugger statements in production builds
    drop: process.env.NODE_ENV === "production" ? ["console", "debugger"] : [],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/health": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
      "/internal": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
