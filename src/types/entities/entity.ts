import type { AuditBase, UUID } from '../core/base';

// ---------------------------------------------------------------------------
// Entity status lifecycle
// ---------------------------------------------------------------------------

export type EntityStatus = 'planning' | 'active' | 'completed' | 'paused' | 'canceled';

export const ENTITY_STATUS_CONFIG: Record<EntityStatus, {
  label: string;
  color: string;
  bgClass: string;
}> = {
  planning:  { label: 'Planeación',  color: 'text-slate-600',   bgClass: 'bg-slate-100'  },
  active:    { label: 'Activo',      color: 'text-emerald-600', bgClass: 'bg-emerald-50' },
  completed: { label: 'Completado',  color: 'text-blue-600',    bgClass: 'bg-blue-50'    },
  paused:    { label: 'Pausado',     color: 'text-amber-600',   bgClass: 'bg-amber-50'   },
  canceled:  { label: 'Cancelado',   color: 'text-red-600',     bgClass: 'bg-red-50'     },
};

// ---------------------------------------------------------------------------
// Entity model (was: Project)
// The UI label ("Proyecto", "Obra", "Cliente") is configured via VITE_ENTITY_LABEL.
// ---------------------------------------------------------------------------

export interface Entity extends AuditBase {
  team_id:       UUID;
  name:          string;
  code:          string | null;
  description:   string | null;
  entity_status: EntityStatus;
  location:      string | null;
  budget:        number | null;
  start_date:    string | null;
  end_date:      string | null;
  metadata?:     Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Input type (for forms — no AuditBase fields)
// ---------------------------------------------------------------------------

export type EntityInput = Pick<Entity,
  | 'name'
  | 'code'
  | 'description'
  | 'entity_status'
  | 'location'
  | 'budget'
  | 'start_date'
  | 'end_date'
>;

// ---------------------------------------------------------------------------
// Access record (was: sys_project_access)
// ---------------------------------------------------------------------------

export interface EntityAccess {
  id:        UUID;
  user_id:   UUID;
  entity_id: UUID;
  team_id:   UUID;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Factory helper
// ---------------------------------------------------------------------------

export function createEmptyEntity(userId: string, teamId: string): Entity {
  return {
    id:            crypto.randomUUID(),
    created_at:    new Date().toISOString(),
    updated_at:    new Date().toISOString(),
    created_by:    userId,
    updated_by:    userId,
    version:       0,
    status:        'active',
    deleted_at:    null,
    team_id:       teamId,
    name:          '',
    code:          null,
    description:   null,
    entity_status: 'planning',
    location:      null,
    budget:        null,
    start_date:    null,
    end_date:      null,
    metadata:      undefined,
  };
}

// ---------------------------------------------------------------------------
// Env config helpers
// ---------------------------------------------------------------------------

/** The UI label for "Entity" (e.g., "Proyecto", "Obra", "Cliente") */
export const ENTITY_LABEL =
  (import.meta.env.VITE_ENTITY_LABEL as string | undefined) ?? 'Entidad';

/** Whether the app supports multiple entities (shows EntitySelector) */
export const MULTI_ENTITY_ENABLED =
  import.meta.env.VITE_ENABLE_MULTI_ENTITY !== 'false';
