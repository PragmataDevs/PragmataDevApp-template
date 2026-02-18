export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  job_title: string | null;
  phone: string | null;
  team_id: string | null;
  role_id: string | null;
  access_level: 'god' | 'admin' | 'member';
  is_role_synced: boolean;
  role_variables: Record<string, any>;
  profile_status: 'active' | 'suspended';
  created_at: string;
  updated_at: string;
  status: string;
}
