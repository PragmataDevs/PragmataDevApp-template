import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  envPrefix: ["VITE_", "PUBLIC_"],
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

          // React core + router
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/react-router-dom/")
          ) {
            return "react-vendor";
          }

          // Supabase client
          if (id.includes("/@supabase/")) {
            return "supabase";
          }

          // PowerSync + SQLite WASM (only loaded when VITE_ENABLE_POWERSYNC=true)
          if (
            id.includes("/@powersync/") ||
            id.includes("/@journeyapps/wa-sqlite/")
          ) {
            return "powersync";
          }

          // Drag & drop (Kanban)
          if (id.includes("/@hello-pangea/dnd/")) {
            return "dnd";
          }

          // Form validation
          if (
            id.includes("/zod/") ||
            id.includes("/react-hook-form/") ||
            id.includes("/@hookform/")
          ) {
            return "forms";
          }

          // Lucide icons: imported in layout components (always loaded),
          // isolated here so changes don't bust the react-vendor cache.
          if (id.includes("/lucide-react/")) {
            return "icons";
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