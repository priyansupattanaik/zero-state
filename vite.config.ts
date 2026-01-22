import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: "/zero-state/", // <--- IMPORTANT: Add this line! Must match your Repo name.
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      buffer: "buffer",
    },
  },
  define: {
    global: {},
  },
});
