import { lazy } from 'react';
import {
  Settings,
  Users,
  Home,
  Shield,
  Layers,
  LayoutDashboard,
  CheckSquare,
  FileText,
  Package,
  ShoppingCart,
  BarChart3,
} from 'lucide-react';
import type { AppRoute } from '@/app/navigation';

// --- Lazy Loading de Páginas ---
/** `/` redirige al sitio público Astro (no hay landing React duplicada). */
const PublicSiteEntry       = lazy(() => import('@/pages/PublicSiteEntry'));
const LoginPage             = lazy(() => import('@/pages/auth/LoginPage'));
const CallbackPage          = lazy(() => import('@/pages/auth/CallbackPage'));
const ResetPasswordPage     = lazy(() => import('@/pages/auth/ResetPasswordPage'));

const DashboardPage         = lazy(() => import('@/pages/dashboard/DashboardPage'));
const ProfilePage           = lazy(() => import('@/pages/profile/ProfilePage'));

// Settings Pages
const RolesPage             = lazy(() => import('@/pages/settings/RolesPage'));
const UsuariosPage          = lazy(() => import('@/pages/settings/UsuariosPage'));
const EntitiesPage          = lazy(() => import('@/pages/settings/EntitiesPage'));

// Ecommerce Pages (feature-flagged by VITE_ENABLE_ECOMMERCE)
const ProductsPage          = lazy(() => import('@/pages/ecommerce/ProductsPage'));
const EcommerceDashboardPage = lazy(() => import('@/pages/ecommerce/EcommerceDashboardPage'));
const EcommerceSalesPage     = lazy(() => import('@/pages/ecommerce/EcommerceSalesPage'));

// Workspace Pages
const TasksPage                 = lazy(() => import('@/pages/workspace/TasksPage'));
const WorkspaceDashboardPage    = lazy(() => import('@/pages/workspace/WorkspaceDashboardPage'));
const DocumentsPage             = lazy(() => import('@/pages/workspace/DocumentsPage'));

const ECOMMERCE_ENABLED = import.meta.env.VITE_ENABLE_ECOMMERCE === 'true';

// =============================================================================
// APP ROUTES (Global Layout: Dashboard, Profile, Settings)
// =============================================================================

export const APP_ROUTES: AppRoute[] = [
  // --- Public (no resource code) ---
  {
    path: '/',
    name: 'Sitio público',
    element: PublicSiteEntry,
    layout: 'public',
    hideInMenu: true,
  },
  {
    path: '/login',
    name: 'Login',
    element: LoginPage,
    layout: 'public',
    hideInMenu: true,
  },
  {
    path: '/auth/callback',
    name: 'Auth Callback',
    element: CallbackPage,
    layout: 'public',
    hideInMenu: true,
  },
  {
    path: '/auth/reset-password',
    name: 'Establecer Contraseña',
    element: ResetPasswordPage,
    layout: 'public',
    hideInMenu: true,
  },

  // --- App global ---
  {
    path: '/dashboard',
    name: 'Inicio',
    icon: Home,
    element: DashboardPage,
    layout: 'app',
    hideInMenu: false,
  },
  {
    path: '/profile',
    name: 'Mi Perfil',
    icon: Users,
    element: ProfilePage,
    layout: 'app',
    hideInMenu: false,
  },

  // --- Settings (group) ---
  {
    path: '/settings/roles',
    name: 'Roles',
    icon: Shield,
    element: RolesPage,
    layout: 'app',
    resourceCode: 'page_settings_roles',
    hideEntitySelector: true,
    group: 'settings',
  },
  {
    path: '/settings/usuarios',
    name: 'Usuarios',
    icon: Users,
    element: UsuariosPage,
    layout: 'app',
    resourceCode: 'page_settings_usuarios',
    hideEntitySelector: true,
    group: 'settings',
  },
  {
    path: '/settings/entities',
    name: 'Entidades',
    icon: Layers,
    element: EntitiesPage,
    layout: 'app',
    resourceCode: 'page_settings_entities',
    hideEntitySelector: true,
    group: 'settings',
  },

  // --- Ecommerce (group) ---
  ...(ECOMMERCE_ENABLED
    ? ([
        {
          path: '/ecommerce',
          name: 'Resumen',
          icon: ShoppingCart,
          element: EcommerceDashboardPage,
          layout: 'app',
          resourceCode: 'page_ecommerce_dashboard',
          hideInMenu: false,
          group: 'ecommerce',
        },
        {
          path: '/ecommerce/products',
          name: 'Productos',
          icon: Package,
          element: ProductsPage,
          layout: 'app',
          resourceCode: 'page_ecommerce_products',
          hideInMenu: false,
          group: 'ecommerce',
        },
        {
          path: '/ecommerce/sales',
          name: 'Ventas',
          icon: BarChart3,
          element: EcommerceSalesPage,
          layout: 'app',
          resourceCode: 'page_ecommerce_orders',
          hideInMenu: false,
          group: 'ecommerce',
        },
      ] as AppRoute[])
    : []),

];

// =============================================================================
// WORKSPACE ROUTES (WorkspaceLayout: /workspace/:entityId/*)
// =============================================================================

export const WORKSPACE_ROUTES: AppRoute[] = [
  {
    path: 'dashboard',
    name: 'Resumen',
    icon: LayoutDashboard,
    element: WorkspaceDashboardPage,
    layout: 'workspace',
    resourceCode: 'page_workspace_dashboard',
    hideInMenu: false,
  },
  {
    path: 'tasks',
    name: 'Tareas',
    icon: CheckSquare,
    element: TasksPage,
    layout: 'workspace',
    resourceCode: 'page_workspace_tasks',
    hideInMenu: false,
  },
  {
    path: 'documents',
    name: 'Documentos',
    icon: FileText,
    element: DocumentsPage,
    layout: 'workspace',
    resourceCode: 'page_workspace_documents',
    hideInMenu: false,
  },

  {
    path: 'config',
    name: 'Configuración',
    icon: Settings,
    element: WorkspaceDashboardPage,
    layout: 'workspace',
    resourceCode: 'page_workspace_config',
    hideInMenu: true,
  },
];

// Alias for backward compatibility during migration
export const PROJECT_ROUTES = WORKSPACE_ROUTES;
