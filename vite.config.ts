import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  base: "/zero-state/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      buffer: "buffer",
      process: "process/browser", // Add this
    },
  },
  define: {
    global: "window", // Change this from {} to 'window' to fix simple-peer issues
    "process.env": {},
  },
});
