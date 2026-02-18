import type { ComponentType, LazyExoticComponent } from 'react';

/**
 * Define el tipo de Layout que envuelve la ruta
 * - public: Sin sidebar, sin protección (Login, Landing)
 * - app: Layout principal (Dashboard global, Configuración de usuario)
 * - project: Layout de proyecto (Sidebar de obra, contexto de proyecto)
 */
export type RouteLayoutType = 'public' | 'app' | 'project';
export type AdminLevelType = 'Admin' | 'User';

export interface AppRoute {
  path: string;
  name: string; // Identificador interno o Label del menú
  icon?: ComponentType<{ className?: string, size?: number }>; // Lucide Icon
  
  // -- Componente --
  // Usamos Lazy para code-splitting automático
  element: LazyExoticComponent<ComponentType<any>> | ComponentType<any>;

  // -- Seguridad (RBAC Data-Driven) --
  // ID del recurso en la DB (sys_resources.code). 
  // Si no tiene, se asume público.
  resourceCode?: string; 
  admin_level?: AdminLevelType;
  
  // -- UI Context --
  layout: RouteLayoutType;
  hideInMenu?: boolean; // Para rutas que existen pero no salen en el sidebar (ej: detalles de contratos)
  hideProjectSelector?: boolean; // Requerimiento específico: Ocultar selector en ciertas pantallas globales
  
  // -- Agrupación en Sidebar --
  group?: string; // Clave de grupo para agrupar rutas bajo un menú expandible (ej: 'settings')

  // -- Jerarquía --
  children?: AppRoute[];
}
