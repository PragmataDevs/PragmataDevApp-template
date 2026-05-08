import { lazy } from 'react';
import {
  Settings,
  Users,
  FileText,
  Home,
  Shield,
  Layers,
  LayoutDashboard,
  Wallet,
  Calculator,
  ReceiptText,
  CheckSquare,
} from 'lucide-react';
import type { AppRoute } from '@/app/navigation';

// --- Lazy Loading de Páginas ---
const LandingPage           = lazy(() => import('@/pages/LandingPage'));
const LoginPage             = lazy(() => import('@/pages/auth/LoginPage'));
const CallbackPage          = lazy(() => import('@/pages/auth/CallbackPage'));
const ResetPasswordPage     = lazy(() => import('@/pages/auth/ResetPasswordPage'));

const DashboardPage         = lazy(() => import('@/pages/dashboard/DashboardPage'));
const ProfilePage           = lazy(() => import('@/pages/profile/ProfilePage'));

// Settings Pages
const RolesPage             = lazy(() => import('@/pages/settings/RolesPage'));
const UsuariosPage          = lazy(() => import('@/pages/settings/UsuariosPage'));
const EntitiesPage          = lazy(() => import('@/pages/settings/EntitiesPage'));

// Workspace Pages
const TasksPage             = lazy(() => import('@/pages/workspace/TasksPage'));

const DashboardPlaceholder  = DashboardPage;

// =============================================================================
// APP ROUTES (Global Layout: Dashboard, Profile, Settings)
// =============================================================================

export const APP_ROUTES: AppRoute[] = [
  // --- Public (no resource code) ---
  {
    path: '/',
    name: 'Landing',
    element: LandingPage,
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
    hideProjectSelector: true,
    group: 'settings',
  },
  {
    path: '/settings/usuarios',
    name: 'Usuarios',
    icon: Users,
    element: UsuariosPage,
    layout: 'app',
    resourceCode: 'page_settings_usuarios',
    hideProjectSelector: true,
    group: 'settings',
  },
  {
    path: '/settings/entities',
    name: 'Entidades',
    icon: Layers,
    element: EntitiesPage,
    layout: 'app',
    resourceCode: 'page_settings_entities',
    hideProjectSelector: true,
    group: 'settings',
  },
];

// =============================================================================
// WORKSPACE ROUTES (WorkspaceLayout: /workspace/:entityId/*)
// =============================================================================

export const WORKSPACE_ROUTES: AppRoute[] = [
  {
    path: 'dashboard',
    name: 'Resumen',
    icon: LayoutDashboard,
    element: DashboardPlaceholder,
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
    path: 'costos',
    name: 'Costos',
    icon: Wallet,
    element: DashboardPlaceholder,
    layout: 'workspace',
    resourceCode: 'page_workspace_costs',
    hideInMenu: false,
    children: [
      {
        path: 'presupuesto',
        name: 'Presupuesto',
        icon: Calculator,
        element: DashboardPlaceholder,
        layout: 'workspace',
        resourceCode: 'page_workspace_costs_budget',
        hideInMenu: false,
      },
      {
        path: 'facturas',
        name: 'Facturas',
        icon: ReceiptText,
        element: DashboardPlaceholder,
        layout: 'workspace',
        resourceCode: 'page_workspace_costs_invoices',
        hideInMenu: false,
      },
    ],
  },
  {
    path: 'contracts',
    name: 'Contratos',
    icon: FileText,
    element: DashboardPlaceholder,
    layout: 'workspace',
    resourceCode: 'page_workspace_contracts',
    hideInMenu: false,
  },
  {
    path: 'config',
    name: 'Configuración',
    icon: Settings,
    element: DashboardPlaceholder,
    layout: 'workspace',
    resourceCode: 'page_workspace_config',
    hideInMenu: true,
  },
];

// Alias for backward compatibility during migration
export const PROJECT_ROUTES = WORKSPACE_ROUTES;
