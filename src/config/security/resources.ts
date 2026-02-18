import type { ResourceType, ResourceAction } from '../../types/auth/rbac';

/**
 * ResourceDefinition:
 * La definición "Hardcoded" que vive en el código.
 * Esta lista es la Fuente de Verdad para el script de seeding.
 */
export interface ResourceDefinition {
  code: string;       // ID único (ej: 'page_projects')
  name: string;       // Nombre humano (ej: 'Pantalla de Proyectos')
  description?: string;
  category: string;   // Agrupador (ejs: 'Proyectos', 'Finanzas')
  type: ResourceType; // 'page', 'widget', 'action', 'data'
  default_actions: ResourceAction[]; // Acciones sugeridas
}

/**
 * CATALOGO MAESTRO DE RECURSOS
 * ----------------------------------------------------------------------
 * Aquí se registran TODAS las partes protegibles de la aplicación.
 * Si no está aquí, no existe para el sistema de seguridad.
 * 
 * ESTRUCTURA SUGERIDA:
 * - Module (Proyectos)
 *   - Pages
 *   - Widgets
 *   - Actions (Botones críticos)
 */
export const APP_RESOURCES: ResourceDefinition[] = [
    
    // =================================================================
    // 1. MODULO: CONFIGURACIÓN (Settings)
    // =================================================================
    {
        code: 'page_settings_roles',
        name: 'Gestión de Roles',
        description: 'Crear, editar y eliminar roles del sistema',
        category: 'Settings',
        type: 'page',
        default_actions: ['read', 'create', 'update', 'delete']
    },
    {
        code: 'page_settings_usuarios',
        name: 'Gestión de Usuarios',
        description: 'Crear, editar y administrar usuarios del equipo',
        category: 'Settings',
        type: 'page',
        default_actions: ['read', 'create', 'update', 'delete']
    },
    {
        code: 'page_settings_proyectos',
        name: 'Gestión de Proyectos',
        description: 'Crear y administrar proyectos',
        category: 'Settings',
        type: 'page',
        default_actions: ['read', 'create', 'update', 'delete']
    },

    // =================================================================
    // 2. MODULO: PROYECTO (Contexto de proyecto)
    // =================================================================
    {
        code: 'page_project_dashboard',
        name: 'Resumen del Proyecto',
        category: 'Project',
        type: 'page',
        default_actions: ['read']
    },
    {
        code: 'page_project_costs',
        name: 'Costos del Proyecto',
        category: 'Project',
        type: 'page',
        default_actions: ['read', 'create', 'update']
    },
    {
        code: 'page_project_costs_budget',
        name: 'Presupuesto',
        category: 'Project',
        type: 'page',
        default_actions: ['read', 'create', 'update']
    },
    {
        code: 'page_project_costs_invoices',
        name: 'Facturas',
        category: 'Project',
        type: 'page',
        default_actions: ['read', 'create', 'update']
    },
    {
        code: 'page_contracts',
        name: 'Contratos',
        category: 'Project',
        type: 'page',
        default_actions: ['read', 'create', 'update', 'delete']
    },
    {
        code: 'page_project_config',
        name: 'Configuración del Proyecto',
        category: 'Project',
        type: 'page',
        default_actions: ['read', 'update']
    },

    // =================================================================
    // 5. ACCIONES SENSIBLES
    // =================================================================
    {
        code: 'action_project_archive',
        name: 'Archivar Proyecto',
        category: 'Actions',
        type: 'action',
        default_actions: ['execute'] 
    },
    {
        code: 'btn_export_project_report',
        name: 'Exportar Excel/PDF',
        category: 'Actions',
        type: 'action',
        default_actions: ['execute']
    },

    // =================================================================
    // 6. FEATURES: Chat & Notificaciones
    // =================================================================
    {
        code: 'feature_chat',
        name: 'Chat',
        description: 'Acceso al sistema de chat (individual y grupal)',
        category: 'Features',
        type: 'action',
        default_actions: ['read', 'create']
    },
    {
        code: 'feature_notifications_send',
        name: 'Enviar Notificaciones',
        description: 'Permiso para enviar notificaciones a usuarios, roles o todos',
        category: 'Features',
        type: 'action',
        default_actions: ['create', 'broadcast']
    },
];

// Helper para Autocompletado (TypeScript Magic)
// Esto permite usar `Permissions.page_dashboard` en el código.
export const Permissions = Object.fromEntries(
    APP_RESOURCES.map(r => [r.code, r.code])
) as Record<string, string>;
