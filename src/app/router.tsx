import { createBrowserRouter, type RouteObject } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { WorkspaceLayout } from "@/components/layout/WorkspaceLayout";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { RouteGuard } from "@/features/auth/components/RouteGuard";
import { RouteLoader } from "@/components/layout/RouteLoader";
import { APP_ROUTES, WORKSPACE_ROUTES } from "./routes.config";
import type { AppRoute } from "./navigation";
import { Suspense } from "react";

/**
 * Helper para transformar nuestra definición de rutas (AppRoute)
 * en la definición nativa de react-router-dom (RouteObject).
 * Aplica automáticamente el RouteGuard si existe un resourceCode.
 */
function mapRoutes(routes: AppRoute[]): RouteObject[] {
  return routes.map((route) => {
    // 1. Crear el elemento envuelto en Suspense (para lazy loading)
    const Element = route.element;
    
    // 2. Definir el componente final:
    //    Si tiene resourceCode, lo envolvemos en el Guard.
    //    Nota: El Guard es un Layout Route que renderiza Outlet,
    //    así que necesitamos una estructura anidada si queremos protegerlo.
    //    Sin embargo, una forma más limpia en v6 es usar un Wrapper Component
    //    o dejar que el RouteGuard sea el padre.
    
    //    Estrategia simplificada: El Layout Padre (Public/App/Project) ya contiene el Outlet.
    //    Insertamos el Guard como un "Wrapper" en la jerarquía.
    
    return {
      path: route.path,
      element: (
        <Suspense fallback={<RouteLoader />}>
          <Element />
        </Suspense>
      ),
      // Mapeo recursivo de hijos si los hubiera
      children: route.children ? mapRoutes(route.children) : undefined,
    };
  });
}

function buildGuardedRoute(route: AppRoute): RouteObject {
  return {
    path: route.path,
    element: (
      <RouteGuard resourceCode={route.resourceCode} adminLevel={route.admin_level}>
        <Suspense fallback={<RouteLoader />}>
          <route.element />
        </Suspense>
      </RouteGuard>
    ),
    children: route.children ? route.children.map(buildGuardedRoute) : undefined,
  };
}

/**
 * Filtramos las rutas por layout para agruparlas bajo su Layout Component correspondiente.
 */
const publicRoutes   = APP_ROUTES.filter(r => r.layout === 'public');
const appRoutes      = APP_ROUTES.filter(r => r.layout === 'app');
const workspaceRoutes = WORKSPACE_ROUTES; 

/**
 * Definición de Rutas de la Aplicación (The Onion Architecture)
 * Refactorizada para ser dinámica y Data-Driven.
 */
export const router = createBrowserRouter([
  // 1. Rutas Públicas
  {
    element: <PublicLayout />,
    children: mapRoutes(publicRoutes),
  },

  // 2. Rutas de Aplicación + Workspace (comparten AppLayout → mismo sidebar)
  {
    element: <AppLayout />,
    children: [
      ...appRoutes.map(buildGuardedRoute),
      // 3. Workspace (contexto de Entity: /workspace/:entityId/*)
      {
        path: '/workspace/:entityId',
        element: <WorkspaceLayout />,
        children: workspaceRoutes.map(buildGuardedRoute),
      },
    ],
  },

  // Fallback 404 (Opcional, pero recomendado)
  {
    path: "*",
    element: <div>404 Not Found</div>
  }
]);

