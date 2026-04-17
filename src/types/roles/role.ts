import type { AuditBase } from '../core/base';

export interface Role extends AuditBase {
  name: string;
  description: string | null;
  is_system_role: boolean;
  can_be_customized: boolean;
  is_dev_role: boolean;
}

export interface RoleDefinition {
  id: string;
  role_id: string;
  resource_code: string;
  granted_actions: string[];
  conditions: string | null;
}