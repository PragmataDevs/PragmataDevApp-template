import { lazy } from 'react';
import { 
  Settings, 
  Users, 
  FileText, 
  Home,
  Shield,
  FolderKanban,
  LayoutDashboard,
  Wallet,
  Calculator,
  ReceiptText
} from 'lucide-react';
import type { AppRoute } from '@/app/navigation';

// --- Lazy Loading de Páginas ---
const LandingPage = lazy(() => import('@/pages/LandingPage'));
const LoginPage = lazy(() => import('@/pages/auth/LoginPage'));
const CallbackPage = lazy(() => import('@/pages/auth/CallbackPage'));
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'));

const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage')); 
const ProfilePage = lazy(() => import('@/pages/profile/ProfilePage'));

// Settings Pages (cada una es independiente, agrupadas por 'settings' en el sidebar)
const RolesPage = lazy(() => import('@/pages/settings/RolesPage'));
const UsuariosPage = lazy(() => import('@/pages/settings/UsuariosPage'));
const ProyectosPage = lazy(() => import('@/pages/settings/ProyectosPage'));

// Reutilizamos el Dashboard como placeholder para las secciones WIP
const DashboardPlaceholder = DashboardPage;

export const APP_ROUTES: AppRoute[] = [
  // --- Rutas Públicas (Sin Resource Code) ---
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

  // --- Nivel 1: App Global (Requiere Resource Code) ---
  {
    path: '/dashboard',
    name: 'Inicio',
    icon: Home,
    element: DashboardPage,
    layout: 'app',
    // Sin resourceCode: todos pueden entrar. Widgets internos controlan visibilidad.
    hideProjectSelector: false,
    hideInMenu: false,
  },
  {
    path: '/profile',
    name: 'Mi Perfil',
    icon: Users,
    element: ProfilePage,
    layout: 'app',
    // Sin resourceCode: siempre accesible (tu propio perfil).
    hideProjectSelector: true,
    hideInMenu: false,
  },
  // --- Configuración (Grupo expandible en sidebar) ---
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
    path: '/settings/proyectos',
    name: 'Proyectos',
    icon: FolderKanban,
    element: ProyectosPage,
    layout: 'app',
    resourceCode: 'page_settings_proyectos',
    hideProjectSelector: true,
    group: 'settings',
  },
];

export const PROJECT_ROUTES: AppRoute[] = [
  {
    path: 'dashboard', // /projects/:id/dashboard
    name: 'Resumen',
    icon: LayoutDashboard,
    element: DashboardPlaceholder,
    layout: 'project',
    resourceCode: 'page_project_dashboard', // <--- NUEVO
    hideInMenu: false,
  },
  {
    path: 'costos',
    name: 'Costos',
    icon: Wallet,
    element: DashboardPlaceholder,
    layout: 'project',
    resourceCode: 'page_project_costs',
    hideInMenu: false,
    children: [
      {
        path: 'presupuesto',
        name: 'Presupuesto',
        icon: Calculator,
        element: DashboardPlaceholder,
        layout: 'project',
        resourceCode: 'page_project_costs_budget',
        hideInMenu: false,
      },
      {
        path: 'facturas',
        name: 'Facturas',
        icon: ReceiptText,
        element: DashboardPlaceholder,
        layout: 'project',
        resourceCode: 'page_project_costs_invoices',
        hideInMenu: false,
      }
    ]
  },
  {
    path: 'contracts',
    name: 'Contratos',
    icon: FileText,
    element: DashboardPlaceholder,
    layout: 'project',
    resourceCode: 'page_contracts',
    hideInMenu: false,
  },
  {
    path: 'config',
    name: 'Configuración',
    icon: Settings,
    element: DashboardPlaceholder,
    layout: 'project',
    resourceCode: 'page_project_config',
    hideInMenu: true,
  }
];
