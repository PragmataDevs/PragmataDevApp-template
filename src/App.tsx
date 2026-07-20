import { RouterProvider } from 'react-router-dom'
import { router } from '@/app/router'
import { AuthProvider } from '@/features/auth/providers/AuthProvider'
import { ThemeProvider } from '@/features/preferences/providers/ThemeProvider'
import { PowerSyncProvider } from '@/lib/db/PowerSyncProvider'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'

function App() {
  return (
    <PowerSyncProvider>
      <AuthProvider>
        <ThemeProvider>
          <ConfirmProvider>
            <RouterProvider router={router} />
          </ConfirmProvider>
        </ThemeProvider>
      </AuthProvider>
    </PowerSyncProvider>
  )
}

export default App
