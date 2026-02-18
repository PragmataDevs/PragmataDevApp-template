import type { AuditBase, UUID } from '../core/base';

/**
 * Team: La Organización o Empresa.
 * Es la dueña de los proyectos y quien paga la suscripción (Multitenancy).
 */
export interface Team extends AuditBase {
    name: string;
    slug: string; // URL friendly name
    logo_url: string | null;
    
    // Identifica si esta es la "Organización Madre" (Dueña del SaaS)
    // Los miembros de este team con nivel 'god' pueden ver otros teams.
    is_platform_owner: boolean; 

    // Business Info
    tax_id?: string | null; // RFC / CUIT / VAT
    address?: string | null;
    web_url?: string | null;
    contact_email?: string | null;

    owner_id: UUID; // Usuario dueño de la cuenta (Billing Point of Contact)

    // Estado de Negocio (Suscripción/Acceso)
    team_status: 'active' | 'suspended' | 'delinquent'; 
}
