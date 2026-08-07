import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    // Default 'node' — rápido, sin DOM, para lógica pura (*.test.ts).
    // Los tests de componentes que sí necesitan document/window ponen
    // `/** @vitest-environment jsdom */` al inicio del archivo (ver Button.test.tsx).
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
  },
})
