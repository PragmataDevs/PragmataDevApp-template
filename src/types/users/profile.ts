import type { AuditBase, UUID } from '../core/base';

export type AccessLevel = 
  | 'god'        // Puede ver TODOS los datos de TODOS los usuarios (Solo válido en Team Platform Owner)
  | 'admin'      // Puede ver TODOS los datos de SU Team
  | 'member';    // Solo puede ver SU propios datos y los de sus proyectos asignados

/**
 * Profile: Identidad UNIFICADA del usuario.
 * Define quién es, dónde trabaja y qué rol base tiene.
 * (Modelo simplificado 1:1:1 -> 1 User, 1 Team, 1 Role)
 */
export interface Profile extends AuditBase {
  // --- Datos Personales ---
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  job_title: string | null; // Label decorativo (ej: "Gerente Sr.")

  // --- Datos de Organización y Seguridad ---
  team_id: UUID; // A qué empresa pertenece y reporta
  role_id: UUID; // Rol Base (Plantilla de Permisos)
  
  access_level: AccessLevel; // Scope de Datos (RLS)
  
  // SWITCH DE FLEXIBILIDAD (A Nivel Usuario):
  // Solo funciona si el ROL tiene 'can_be_customized = true'.
  // true = Permisos son espejo del rol (Sincronizado/Estándar).
  // false = Permisos custom activados (Usuario Especial/Rebelde).
  is_role_synced: boolean;

  // Variables Extra del Rol (Nivel Chido/Chafa)
  role_variables?: Record<string, any>;

  // --- Estado de Negocio ---
  profile_status: 'active' | 'suspended'; 
}
