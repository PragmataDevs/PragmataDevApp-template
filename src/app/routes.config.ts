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
  Globe,
} from 'lucide-react';
import type { AppRoute } from '@/app/navigation';

// --- Lazy Loading de Páginas ---
/** `/` redirige al sitio público Astro (no hay landing React duplicada). */
const PublicSiteEntry       = lazy(() => import('@/features/shell/pages/PublicSiteEntry'));
const LoginPage             = lazy(() => import('@/features/auth/pages/LoginPage'));
const CallbackPage          = lazy(() => import('@/features/auth/pages/CallbackPage'));
const ResetPasswordPage     = lazy(() => import('@/features/auth/pages/ResetPasswordPage'));
const ForgotPasswordPage    = lazy(() => import('@/features/auth/pages/ForgotPasswordPage'));

const DashboardPage         = lazy(() => import('@/features/dashboard/pages/DashboardPage'));
const ProfilePage           = lazy(() => import('@/features/profile/pages/ProfilePage'));

// Settings (chasis) — páginas en su feature
const RolesPage             = lazy(() => import('@/features/roles/pages/RolesPage'));
const UsuariosPage          = lazy(() => import('@/features/users/pages/UsuariosPage'));
const EntitiesPage          = lazy(() => import('@/features/entities/pages/EntitiesPage'));
const UsuarioNewPage        = lazy(() => import('@/features/users/pages/UsuarioNewPage'));
const EntityNewPage         = lazy(() => import('@/features/entities/pages/EntityNewPage'));

// Ecommerce (feature-flagged by VITE_ENABLE_ECOMMERCE)
const ProductsPage          = lazy(() => import('@/features/ecommerce/pages/ProductsPage'));
const EcommerceDashboardPage = lazy(() => import('@/features/ecommerce/pages/EcommerceDashboardPage'));
const EcommerceSalesPage     = lazy(() => import('@/features/ecommerce/pages/EcommerceSalesPage'));

const SitePagesPage          = lazy(() => import('@/features/cms/pages/SitePagesPage'));

// Workspace
const TasksPage                 = lazy(() => import('@/features/tasks/pages/TasksPage'));
const WorkspaceDashboardPage    = lazy(() => import('@/features/workspace/pages/WorkspaceDashboardPage'));
const DocumentsPage             = lazy(() => import('@/features/documents/pages/DocumentsPage'));

const ECOMMERCE_ENABLED = import.meta.env.VITE_ENABLE_ECOMMERCE === 'true';
/** CMS sitio público: activo por defecto; desactivar con `VITE_ENABLE_SITE_CMS=false`. */
const SITE_CMS_ENABLED = import.meta.env.VITE_ENABLE_SITE_CMS !== 'false';

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
    path: '/auth/forgot-password',
    name: 'Recuperar contraseña',
    element: ForgotPasswordPage,
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
    path: '/settings/usuarios/nuevo',
    name: 'Nuevo usuario',
    element: UsuarioNewPage,
    layout: 'app',
    resourceCode: 'page_settings_usuarios',
    hideEntitySelector: true,
    hideInMenu: true,
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
  {
    path: '/settings/entities/nuevo',
    name: 'Nueva entidad',
    element: EntityNewPage,
    layout: 'app',
    resourceCode: 'page_settings_entities',
    hideEntitySelector: true,
    hideInMenu: true,
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

  // --- SEO / CMS sitio público (group) ---
  ...(SITE_CMS_ENABLED
    ? ([
        {
          path: '/seo/pages',
          name: 'Páginas del sitio',
          icon: Globe,
          element: SitePagesPage,
          layout: 'app',
          resourceCode: 'page_seo_site_pages',
          hideInMenu: false,
          group: 'seo',
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
