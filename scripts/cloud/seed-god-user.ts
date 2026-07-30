import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export type SeedGodUserInput = {
  supabaseUrl: string;
  serviceRoleKey: string;
  email: string;
  password: string;
  fullName: string;
  teamName?: string;
  teamSlug?: string;
  roleName?: string;
};

export type SeedGodUserResult = {
  userId: string;
  email: string;
  createdAuthUser: boolean;
  createdProfile: boolean;
  skipped: boolean;
};

export async function seedGodUser(input: SeedGodUserInput): Promise<SeedGodUserResult> {
  const admin = createClient(input.supabaseUrl, input.serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const teamName = input.teamName || 'Pragmata Devs';
  const teamSlug = input.teamSlug || 'pragmata-devs';
  const roleName = input.roleName || 'Super Admin';

  const { data: existingProfile } = await admin
    .from('profiles')
    .select('id, email, access_level')
    .eq('email', input.email)
    .maybeSingle();

  if (existingProfile?.access_level === 'god') {
    return {
      userId: existingProfile.id,
      email: input.email,
      createdAuthUser: false,
      createdProfile: false,
      skipped: true,
    };
  }

  let userId = existingProfile?.id || '';
  let createdAuthUser = false;

  if (!userId) {
    const { data: listed, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (listError) throw new Error(`No se pudo listar usuarios Auth: ${listError.message}`);

    const found = listed.users.find((u) => (u.email || '').toLowerCase() === input.email.toLowerCase());
    if (found?.id) {
      userId = found.id;
    }
  }

  if (!userId) {
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: input.email,
      password: input.password || randomBytes(16).toString('hex'),
      email_confirm: true,
      user_metadata: { full_name: input.fullName },
    });
    if (createError || !created.user?.id) {
      throw new Error(`No se pudo crear usuario Auth: ${createError?.message || 'sin id'}`);
    }
    userId = created.user.id;
    createdAuthUser = true;
  }

  let teamId: string | null = null;
  const { data: teamRow } = await admin.from('teams').select('id').eq('slug', teamSlug).maybeSingle();
  if (teamRow?.id) {
    teamId = teamRow.id;
    await admin.from('teams').update({ name: teamName, is_platform_owner: true }).eq('id', teamId);
  } else {
    const { data: insertedTeam, error: teamError } = await admin
      .from('teams')
      .insert({ name: teamName, slug: teamSlug, is_platform_owner: true })
      .select('id')
      .single();
    if (teamError || !insertedTeam?.id) {
      throw new Error(`No se pudo crear team: ${teamError?.message || 'sin id'}`);
    }
    teamId = insertedTeam.id;
  }

  let roleId: string | null = null;
  const { data: roleRow } = await admin.from('sys_roles').select('id').eq('name', roleName).maybeSingle();
  if (roleRow?.id) {
    roleId = roleRow.id;
  } else {
    const { data: insertedRole, error: roleError } = await admin
      .from('sys_roles')
      .insert({ name: roleName, description: 'Rol con acceso total al sistema', can_be_customized: true })
      .select('id')
      .single();
    if (roleError || !insertedRole?.id) {
      throw new Error(`No se pudo crear rol: ${roleError?.message || 'sin id'}`);
    }
    roleId = insertedRole.id;
  }

  const profilePayload = {
    id: userId,
    email: input.email,
    full_name: input.fullName,
    team_id: teamId,
    role_id: roleId,
    access_level: 'god' as const,
    is_role_synced: false,
  };

  const { error: profileError } = await admin.from('profiles').upsert(profilePayload, { onConflict: 'id' });
  if (profileError) {
    throw new Error(`No se pudo crear perfil god: ${profileError.message}`);
  }

  return {
    userId,
    email: input.email,
    createdAuthUser,
    createdProfile: true,
    skipped: false,
  };
}
