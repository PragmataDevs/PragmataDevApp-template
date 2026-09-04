/**
 * billing.ts — helpers compartidos de Stripe BILLING (la mensualidad que cobra
 * PragmataDevs por tenant). Distinto de stripe-checkout / stripe-webhook, que
 * son de `orders` (e-commerce). No mezclar.
 *
 * Tablas: team_subscriptions, subscription_plans, billing_events
 * (migración 20260904091000_team_subscriptions.sql).
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type SubStatus = 'gratis' | 'de_paga' | 'periodo_gracia' | 'suspendido' | 'cancelado';

/** Stripe subscription.status → nuestro sub_status. */
export function mapStripeStatus(status: string): SubStatus {
  switch (status) {
    case 'trialing':
    case 'active':
      return 'de_paga';
    case 'past_due':
      return 'periodo_gracia';
    case 'unpaid':
    case 'incomplete':
    case 'incomplete_expired':
    case 'paused':
      return 'suspendido';
    case 'canceled':
      return 'cancelado';
    default:
      return 'suspendido';
  }
}

/** Días de gracia tras un cobro fallido antes de suspender (spec §2). */
export const GRACE_DAYS = 7;

/** Perfil + team del usuario autenticado; solo admins del team pueden operar billing. */
export async function requireTeamAdmin(
  userClient: SupabaseClient,
  userId: string,
): Promise<{ teamId: string; email: string; teamName: string }> {
  const { data: profile, error } = await userClient
    .from('profiles')
    .select('team_id, email, access_level, teams:teams!profiles_team_id_fkey(name)')
    .eq('id', userId)
    .maybeSingle();

  if (error || !profile) {
    throw new Response(JSON.stringify({ error: 'profile_not_found' }), { status: 403 });
  }
  if (profile.access_level !== 'admin' && profile.access_level !== 'god') {
    throw new Response(JSON.stringify({ error: 'only_team_admin' }), { status: 403 });
  }
  const teamName = (profile.teams as unknown as { name?: string } | null)?.name ?? '';
  return { teamId: profile.team_id as string, email: profile.email as string, teamName };
}

/** Plan gratis por default de un producto (para regresar al cancelar). */
export async function defaultFreePlan(service: SupabaseClient, producto: string): Promise<string | null> {
  const { data } = await service
    .from('subscription_plans')
    .select('code')
    .eq('producto', producto)
    .eq('is_default_free', true)
    .eq('status', 'active')
    .maybeSingle();
  return (data?.code as string | undefined) ?? null;
}
