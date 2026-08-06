import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import './index.css'
import App from './App.tsx'
import { installUUIDPolyfill } from './lib/uuid'

// Debe correr antes de renderizar: en dev remoto por HTTP el browser no expone crypto.randomUUID.
installUUIDPolyfill()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster
      position="bottom-right"
      toastOptions={{
        style: {
          background: 'var(--pragmata-surface)',
          color: 'var(--pragmata-text)',
          border: '1px solid var(--pragmata-border)',
        },
      }}
    />
  </StrictMode>,
)
