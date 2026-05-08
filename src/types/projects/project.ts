import type { AuditBase, UUID } from '../core/base';

export function createEmptyProject(userId: string, teamId: string): Project {
  return {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    created_by: userId,
    updated_by: userId,
    version: 0,
    status: 'active',
    deleted_at: null,
    team_id: teamId,
    name: '',
    code: null,
    description: null,
    project_status: 'planning',
    location: null,
    budget: null,
    start_date: null,
    end_date: null,
    metadata: undefined,
  };
}

/**
 * Project: La unidad de trabajo (Obra, Campaña, Caso).
 */
export interface Project extends AuditBase {
    team_id: UUID; // A qué empresa pertenece
    name: string;
    code: string | null; // Código interno (ej: "OBRA-2024-001")
    description: string | null;

    // Estado del Negocio (Ciclo de vida de la obra)
    // NOTA: 'status' (AuditBase) controla borrado lógico. Este controla la etapa.
    project_status: 'planning' | 'active' | 'completed' | 'paused' | 'canceled';
    
    // Core Business Fields (Columnas reales para indexación)
    location: string | null;
    budget: number | null; // DECIMAL en DB
    start_date: string | null; // ISO Date
    end_date: string | null;   // ISO Date
    
    // Configuración Adicional (JSONB)
    metadata?: Record<string, any>;
}
