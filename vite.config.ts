import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;

          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/react-router-dom/")
          ) {
            return "react-vendor";
          }

          if (id.includes("/@supabase/")) {
            return "supabase";
          }

          if (
            id.includes("/@powersync/") ||
            id.includes("/@journeyapps/wa-sqlite/")
          ) {
            return "powersync";
          }
        },
      },
    },
  },
  server: {
    host: true,
    port: 7070
  }
})