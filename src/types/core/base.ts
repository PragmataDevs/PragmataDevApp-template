import type { ComponentType, LazyExoticComponent } from 'react';


export type UUID = string; // Alias para claridad

export type AuditStatus = 'active' | 'deleted';

/**
 * AuditBase: Campos estándar que toda tabla de negocio debe tener.
 * Estos campos son manejados automáticamente por Supabase/Triggers.
 */
export interface AuditBase {
  id: UUID;
  created_at: string; // ISO Timestamp
  updated_at: string; // ISO Timestamp
  created_by?: UUID | null; // ID del usuario que creó el registro
  updated_by?: UUID | null;
  
  // Status de Auditoría (Existencia del dato)
  // active = Visible
  // deleted = Borrado Lógico (Papelera)
  status: AuditStatus;
  
  deleted_at?: string | null; // Fecha opcional de cuando se marcó como deleted
}

export type RouteLayoutType = 'public' | 'app' | 'project';
export type AdminLevelType = 'Admin' | 'User';

// NOTA: ProjectRole y AppResource eran del sistema viejo.
// Ahora todo se maneja via sys_resources y sys_roles (RBAC).
// Se mantienen AppRoute para el Router, pero desacoplado de roles viejos.

export interface AppRoute {
  path: string;
  name: string; // Identificador interno o Label del menú
  icon?: ComponentType<{ className?: string, size?: number }>; // Lucide Icon
  
  // -- Componente --
  // Usamos Lazy para code-splitting automático
  element: LazyExoticComponent<ComponentType<any>> | ComponentType<any>;
  
  // -- UI Context --
  layout: RouteLayoutType;
  hideInMenu?: boolean; // Para rutas que existen pero no salen en el sidebar (ej: detalles de contratos)
  hideProjectSelector?: boolean; // Requerimiento específico: Ocultar selector en ciertas pantallas globales
  
  // -- Jerarquía --
  children?: AppRoute[];
  // children_resource eliminado (usar RBAC)
}

// ─── Documentos (Base transversal) ───────────────────────────

export type DocumentStatus = 'pending' | 'verified' | 'expired' | 'rejected';

/**
 * Documento genérico de trabajo (PDF, imagen, etc.)
 * Compatible con Storage privado y URL firmada.
 */
export interface DocumentW {
  id: UUID; // UUID único del documento
  nombre: string; // Nombre del documento (CSF, CV, INE, etc.)
  type?: string; // Tipo/categoría (CSF, CV, ACTA, INE, etc.)
  description?: string; // Descripción adicional

  // Ubicación y acceso
  bucket?: string; // Bucket en Supabase Storage (default: 'documents')
  path?: string; // Ruta completa en storage (ej: contratistas/uuid/csf.pdf)
  url?: string; // URL pública o firmada para acceso

  // Archivo
  file?: File; // Archivo en sí (para upload desde formulario)
  mime_type?: string; // Tipo MIME (application/pdf, image/png, etc.)
  size?: number; // Tamaño en bytes

  // Metadata
  created_at?: string; // Cuándo se subió
  updated_at?: string; // Cuándo se actualizó
  uploaded_by?: UUID; // ID del usuario que lo subió

  // Estado
  status?: DocumentStatus;
  expires_at?: string; // Fecha de expiración (si aplica)

  // Adicional
  metadata?: Record<string, unknown>; // Datos adicionales personalizados
}
