import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import './index.css'
import App from './App.tsx'

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
