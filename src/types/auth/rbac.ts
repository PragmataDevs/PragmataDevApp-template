import type { AuditBase, UUID } from '../core/base';

/**
 * ResourceType: Clasificación del recurso para saber cómo manejarlo en la UI.
 * - 'page': Una ruta completa (ej: /projects/dashboard)
 * - 'widget': Un componente grande dentro de una página (ej: Gráfica de Costos)
 * - 'action': Un botón o funcionalidad específica (ej: Botón Eliminar)
 * - 'data': Un campo o dato sensible (ej: Precios Unitarios)
 */
export type ResourceType = 'page' | 'widget' | 'action' | 'data' | string;

/**
 * ResourceAction: Qué puede hacer el usuario con el recurso.
 * Se deja abierto a string para flexibilidad, pero definimos los comunes.
 */
export type ResourceAction = 'create' | 'read' | 'update' | 'delete' | 'approve' | 'export' | string;

/**
 * SystemResource: El átomo de seguridad (sys_resources).
 * Representa cualquier cosa en la App que pueda ser protegida.
 */
export interface SystemResource extends AuditBase {
  code: string; // ID único legible: 'page_contracts'
  name: string; // Nombre humano: "Página de Contratos"
  description?: string;
  category?: string; // Agrupador visual: 'Modulo de Costos'
  type: ResourceType;
  
  // Lifecycle del recurso (útil para deprecation)
  resource_status: 'active' | 'deprecated' | 'maintenance';

  // Acciones disponibles por defecto para este recurso (ej: ['read', 'create'])
  default_actions: ResourceAction[];

  /**
   * Dependencias Explícitas (Future-Proof):
   * Lista de otros resource_codes necesarios para que este funcione.
   * Ej: 'widget_costs' depende de ['page_dashboard']
   * Útil para autoselección en la UI de roles.
   */
  depends_on?: string[];
}

/**
 * SystemRole: La "Plantilla" de permisos (sys_roles).
 */
export interface SystemRole extends AuditBase {
  name: string; // 'Residente', 'Auditor'
  description?: string;
  is_system_role: boolean; // true = Roles hardcodeados intocables
  
  // CONTROL GLOBAL DE MODIFICACIÓN:
  // true = Este Rol PERMITE que sus usuarios tengan permisos custom.
  // false = Este Rol es ESTRICTO. Ningún usuario puede desviarse del molde.
  can_be_customized: boolean; 

  is_dev_role: boolean; // rol para el programador
  
  // (Nota: status heredado de AuditBase maneja active/deleted)

  // (Nota: Las definiciones detalladas viven en sys_role_definitions)
}

/**
 * RoleDefinition: El detalle de permisos de una plantilla (sys_role_definitions).
 */
export interface RoleDefinition {
  id: UUID;
  role_id: UUID;
  resource_code: string;
  granted_actions: ResourceAction[]; // ej: ['read', 'write']
  
  // Condicionales Avanzados (Future-Proof, opcional)
  // Ej: { "max_amount": 10000, "region": "norte" }
  conditions?: Record<string, any>;
}

/**
 * Nota: La relación Team/Rol ahora vive directamente en src/types/users/profile.ts
 * para simplificar el modelo (1 User = 1 Team = 1 Role).
 */

/**
 * ProjectAccess: Lista blanca de a qué proyectos puede entrar.
 * NO define qué puede hacer (eso lo define el Profile Role + Permisos), solo SI puede entrar.
 */
export interface ProjectAccess extends AuditBase {
    user_id: UUID;
    project_id: UUID;
    team_id: UUID; // Redundancia útil para queries rápidas
}

// UserAssignment Deprecado por el nuevo modelo separado
// export interface UserAssignment ... (ELIMINADO)

/**
 * UserPermission: El permiso efectivo final (sys_user_permissions).
 * Esto es lo que lee el Frontend para decidir si muestra un botón.
 */
export interface UserPermission {
  id: UUID;
  user_id: UUID;
  team_id: UUID;
  project_id: UUID | null;
  resource_code: string;
  granted_actions: ResourceAction[]; // Checklist final
  
  // Si el permiso tiene condiciones específicas (mas allá de sí/no)
  conditions?: Record<string, any>;

  is_customized: boolean;
}

/**
 * SessionPermissions (Frontend Runtime Object):
 * Objeto optimizado para consulta rápida en memoria (O(1)).
 * Map<ResourceCode, Set<Actions>>
 */
export interface SessionPermissions {
  // Ej: 'page_contracts' -> Set(['read', 'create'])
  permissions: Map<string, Set<ResourceAction>>;
  
  // Helpers rápidos
  isAdmin: boolean;
  roleName?: string;
}
