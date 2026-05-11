/**
 * Tipos isomórficos viven en @pragmata/core (ERP + Astro + scripts).
 * Este archivo conserva solo lo acoplado a React (rutas / router).
 */
export type {
  UUID,
  AuditStatus,
  AuditBase,
  DocumentStatus,
  DocumentW,
} from '@pragmata/core';

import type { ComponentType, LazyExoticComponent } from 'react';

export type RouteLayoutType = 'public' | 'app' | 'workspace' | 'project'; // 'project' kept as alias
export type AdminLevelType = 'Admin' | 'User';

export interface AppRoute {
  path: string;
  name: string;
  icon?: ComponentType<{ className?: string; size?: number }>;

  element: LazyExoticComponent<ComponentType<unknown>> | ComponentType<unknown>;

  layout: RouteLayoutType;
  hideInMenu?: boolean;
  hideEntitySelector?: boolean;
  resourceCode?: string;
  group?: string;
  admin_level?: AdminLevelType;

  children?: AppRoute[];
}
