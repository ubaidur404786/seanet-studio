import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// during `npm run dev` the api runs on :8000, so we forward /api calls there.
// in production the backend serves the built files itself, so no proxy is needed.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // recharts alone is ~400 kB, one bundle is fine for a single page app
  build: { chunkSizeWarningLimit: 800 },
  server: {
    proxy: { "/api": "http://localhost:8000" },
  },
});
