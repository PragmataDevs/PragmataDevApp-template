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
    /**
     * Puente a Supabase local por el MISMO puerto del dev server.
     *
     * Para abrir la app desde otra máquina (celular por Tailscale, otra compu),
     * el navegador tendría que alcanzar DOS puertos: el de Vite y el de Supabase.
     * El segundo no pasa —aunque Docker lo publique en 0.0.0.0— y el login truena
     * con "Failed to fetch" pese a tener las credenciales bien. Comprobado A/B en
     * crm-objetiva el 31-jul-2026.
     *
     * Con este proxy basta con que el puerto de Vite sea alcanzable: las llamadas
     * viajan por el mismo origen (adiós CORS) y Vite las reenvía a Supabase.
     * `dev-all.sh` apunta VITE_SUPABASE_URL a `<ip>:<puerto>/supabase` y exporta
     * SUPABASE_LOCAL_URL con el puerto real del stack de este proyecto.
     *
     * No afecta el desarrollo normal: si VITE_SUPABASE_URL apunta directo al
     * puerto de Supabase (o a la nube), esta ruta simplemente no se usa.
     */
    proxy: {
      '/supabase': {
        target: process.env.SUPABASE_LOCAL_URL || 'http://127.0.0.1:54321',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/supabase/, ''),
      },
    },
  },
})