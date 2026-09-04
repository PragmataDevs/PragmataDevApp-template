import { useCallback } from 'react';
import { useAuth } from './useAuth';

/**
 * Hook para validar permisos basado en Data-Driven RBAC.
 * Valida contra códigos de recurso (sys_resources.code) usando:
 * - isGod (public.is_god()) / access_level admin = bypass
 * - sys_user_permissions cargados en AuthProvider (members)
 */
export function usePermission() {
  const { profile, permissions, loading, isGod } = useAuth();
  
  /**
   * Verifica si el usuario tiene permiso para un código de recurso específico.
   * Opcionalmente verifica una acción concreta (ej: 'read', 'create').
   * Si no se pasa action, solo verifica que el recurso exista en sus permisos.
   */
  const hasPermission = useCallback((resourceCode?: string, action?: string): boolean => {
    if (loading) return false;

    // Si la ruta no requiere recurso explícito, basta con estar autenticado —
    // ANTES del check de `profile`: un usuario recién confirmado (signup
    // self-serve) llega aquí con sesión pero sin fila en `profiles` todavía
    // (la crea `create_tenant()` en el wizard `/bienvenida`, que no lleva
    // `resourceCode` a propósito). Si este check fuera después de `!profile`,
    // `RouteGuard` lo rebotaría a `/dashboard` antes de poder completar el alta.
    if (!resourceCode) return true;

    if (!profile) return false;

    // 1. GOD MODE — alineado con public.is_god() (god + platform owner)
    if (isGod) return true;

    // 2. ADMIN: acceso total dentro de su equipo
    if (profile.access_level === 'admin') return true;

    // 3. MEMBER: consultar permisos explícitos
    const grantedActions = permissions[resourceCode];
    if (!grantedActions || grantedActions.length === 0) return false;

    // Si no se pide acción específica, basta con tener el recurso
    if (!action) return true;

    // Verificar que la acción esté en el array
    return grantedActions.includes(action);
  }, [profile, permissions, loading, isGod]);

  const isAdmin = useCallback(() => {
    return isGod || profile?.access_level === 'admin';
  }, [profile, isGod]);

  return { hasPermission, isAdmin, loading };
}
