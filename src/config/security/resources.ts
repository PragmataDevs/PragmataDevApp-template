import type { ResourceType, ResourceAction } from '@/features/auth/types/rbac';

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
        code: 'page_settings_entities',
        name: 'Gestión de Entidades',
        description: 'Crear y administrar entidades (proyectos, obras, clientes, etc.)',
        category: 'Settings',
        type: 'page',
        default_actions: ['read', 'create', 'update', 'delete']
    },

    // =================================================================
    // 2. MODULO: WORKSPACE (Contexto de Entity)
    // =================================================================
    {
        code: 'page_workspace_dashboard',
        name: 'Resumen de Workspace',
        category: 'Workspace',
        type: 'page',
        default_actions: ['read']
    },
    {
        code: 'page_workspace_tasks',
        name: 'Tareas (Kanban)',
        category: 'Workspace',
        type: 'page',
        default_actions: ['read', 'create', 'update', 'delete']
    },
    {
        code: 'page_workspace_documents',
        name: 'Documentos',
        description: 'Gestión de documentos de la entidad: contratos, reportes, facturas, etc.',
        category: 'Workspace',
        type: 'page',
        default_actions: ['read', 'create', 'update', 'delete']
    },
    {
        code: 'page_workspace_config',
        name: 'Configuración del Workspace',
        category: 'Workspace',
        type: 'page',
        default_actions: ['read', 'update']
    },

    // =================================================================
    // 3. MODULO: E-COMMERCE (feature-flagged: VITE_ENABLE_ECOMMERCE)
    // =================================================================
    {
        code: 'page_ecommerce_dashboard',
        name: 'Ecommerce — Resumen',
        description: 'KPIs y estado general de ventas y pedidos',
        category: 'Ecommerce',
        type: 'page',
        default_actions: ['read']
    },
    {
        code: 'page_ecommerce_products',
        name: 'Catálogo de Productos',
        description: 'Crear, editar y eliminar productos del catálogo público',
        category: 'Ecommerce',
        type: 'page',
        default_actions: ['read', 'create', 'update', 'delete']
    },
    {
        code: 'page_ecommerce_orders',
        name: 'Pedidos',
        description: 'Ver y gestionar los pedidos recibidos',
        category: 'Ecommerce',
        type: 'page',
        default_actions: ['read', 'update']
    },

    // =================================================================
    // 4b. SEO / Sitio público (ocultar rutas con VITE_ENABLE_SITE_CMS=false)
    // =================================================================
    {
        code: 'page_seo_site_pages',
        name: 'Páginas del sitio (CMS)',
        description: 'Editar landing y páginas públicas Markdown',
        category: 'SEO',
        type: 'page',
        default_actions: ['read', 'create', 'update', 'delete']
    },

    // =================================================================
    // 5. ACCIONES SENSIBLES
    // =================================================================
    {
        code: 'action_entity_archive',
        name: 'Archivar Entidad',
        category: 'Actions',
        type: 'action',
        default_actions: ['execute']
    },
    {
        code: 'action_export_entity_report',
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
