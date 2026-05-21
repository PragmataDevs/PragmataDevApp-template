import type { AuditBase } from '@/types/core/base';

export function createEmptyRole(userId: string): Role {
  return {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: userId,
    updated_by: userId,
    version: 0,
    status: 'active',
    deleted_at: null,
    name: '',
    description: null,
    is_system_role: false,
    can_be_customized: true,
    is_dev_role: false,
  };
}

export interface Role extends AuditBase {
  name: string;
  description: string | null;
  is_system_role: boolean;
  can_be_customized: boolean;
  is_dev_role: boolean;
}

// Fuente canónica de RoleDefinition: src/features/auth/types/rbac.ts
// Re-exportado aquí para compatibilidad de imports existentes.
export type { RoleDefinition } from '@/features/auth/types/rbac';