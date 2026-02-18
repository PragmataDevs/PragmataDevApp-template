import { RouterProvider } from 'react-router-dom'
import { router } from '@/app/router'
import { AuthProvider } from '@/features/auth/providers/AuthProvider'
import { ThemeProvider } from '@/features/preferences/providers/ThemeProvider'
import { PowerSyncProvider } from '@/lib/db/PowerSyncProvider'

function App() {
  return (
    <PowerSyncProvider>
      <AuthProvider>
        <ThemeProvider>
          <RouterProvider router={router} />
        </ThemeProvider>
      </AuthProvider>
    </PowerSyncProvider>
  )
}

export default App
