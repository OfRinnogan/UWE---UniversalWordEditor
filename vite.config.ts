import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: true,
    port: 3000,
    // Frontend code calls the relative "/api/*" path; the dev server proxies it
    // to the FastAPI backend running on port 8001 (see backend/README or
    // `uvicorn main:app --reload --port 8001`).
    proxy: {
      "/api": {
        target: "http://localhost:8001",
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: true,
    port: 4173,
    // `vite preview` (used to sanity-check a production build locally) does
    // not inherit `server.proxy` — it needs its own copy of the same rule.
    proxy: {
      "/api": {
        target: "http://localhost:8001",
        changeOrigin: true,
      },
    },
  },
});
