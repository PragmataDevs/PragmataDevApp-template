import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

/**
 * PUERTO DE DESARROLLO — lo manda el registro central: ~/PragmataDevs/ports.json
 *
 * Cada proyecto tiene un índice `n` y de ahí se derivan TODOS sus puertos
 * (app = 7000+n*10). Al instanciar un cliente, la factory reserva su `n` y escribe
 * VITE_PORT en su .env. Para ver el mapa: `pnpm ports:check --table`.
 *
 * El fallback de abajo es el puerto del PROPIO template (n=2), no un default
 * compartido. Esto es a propósito: antes decía 7070 y, como instanciar un cliente
 * copia este archivo tal cual, tres proyectos acabaron peleándose el 7070. Con el
 * puerto del template como fallback + strictPort, un cliente al que no se le escribió
 * su VITE_PORT truena de inmediato en vez de robarle el puerto a otro en silencio.
 *
 * `process.env` NO trae el .env al evaluar este config: hay que cargarlo con loadEnv.
 */
const env = loadEnv("development", process.cwd(), ["VITE_", "PUBLIC_"])
const port = Number(process.env.VITE_PORT || env.VITE_PORT) || 7020

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
    port,
    strictPort: true,
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