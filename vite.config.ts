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

          // React core + router. Match exacto por paquete: `/react/` como
          // substring atrapaba `@tiptap/react`, `react-hook-form`, etc. y los
          // hundía en react-vendor. Anclamos a `/node_modules/<pkg>/`.
          if (
            id.includes("/node_modules/react/") ||
            id.includes("/node_modules/react-dom/") ||
            id.includes("/node_modules/react-router-dom/")
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

          // @hello-pangea/dnd (~103 KB) solo lo usa el Kanban de TasksPage
          // (lazy). Sin chunk manual, rollup lo coloca con su página lazy y
          // deja de precargarse en la primera pintura de toda la app.

          // Form validation
          if (
            id.includes("/zod/") ||
            id.includes("/react-hook-form/") ||
            id.includes("/@hookform/")
          ) {
            return "forms";
          }

          // Rich text editor (only loaded on CMS pages)
          if (id.includes("/@tiptap/")) {
            return "tiptap";
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
    port: Number(process.env.VITE_PORT) || 7070,
  },
})