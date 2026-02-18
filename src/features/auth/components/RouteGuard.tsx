import type { ReactNode } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { usePermission } from '../hooks/usePermission';
import { useAuth } from '../hooks/useAuth';
import type { AdminLevelType } from '@/app/navigation';

interface RouteGuardProps {
  resourceCode?: string;
  adminLevel?: AdminLevelType;
  children?: ReactNode;
}

export function RouteGuard({ resourceCode, adminLevel, children }: RouteGuardProps) {
  const { hasPermission, isAdmin, loading } = usePermission();
  const { isAuthenticated } = useAuth();

  if (loading) {
     return <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600"></div>
     </div>;
  }

    if (!isAuthenticated) {
     return <Navigate to="/login" replace />;
    }

  // 1. Verificar Nivel de Admin (si aplica)
  if (adminLevel === 'Admin' && !isAdmin()) {
    console.warn(`[RouteGuard] Access denied. Requires Admin Level.`);
    return <Navigate to="/" replace />;
  }

  // 2. Verificar Permiso de Recurso (si aplica)
  if (!hasPermission(resourceCode)) {
    // TODO: Redirigir a una página de "Acceso Denegado" (403) bonita.
    console.warn(`[RouteGuard] Access denied for resource: ${resourceCode}`);
    return <Navigate to="/dashboard" replace />;
  }

  // Si tiene permiso (o no requiere ninguno), renderizamos el contenido
  return children ? <>{children}</> : <Outlet />;
}
