import type { AuditBase } from '../core/base';

export interface Role extends AuditBase {
  name: string;
  description: string | null;
  is_system_role: boolean;
  can_be_customized: boolean;
  is_dev_role: boolean;
}

// Fuente canónica de RoleDefinition: src/types/auth/rbac.ts
// Re-exportado aquí para compatibilidad de imports existentes.
export type { RoleDefinition } from '@/types/auth/rbac';