import { useState, useEffect, useCallback } from 'react';
import { X, Loader2, Search, UserPlus, Trash2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { resolveSignedUrl } from '@/lib/storage';
import type { ProjectMember } from '../hooks/useProjects';

interface ProjectMembersPanelProps {
  projectId: string;
  projectName: string;
  onClose: () => void;
  fetchProjectMembers: (projectId: string) => Promise<ProjectMember[]>;
  addProjectMember: (projectId: string, userId: string) => Promise<void>;
  removeProjectMember: (projectId: string, userId: string) => Promise<void>;
  canManage: boolean;
}

interface TeamUser {
  id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  role_name: string;
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    return name
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }
  return email.substring(0, 2).toUpperCase();
}

function useAvatarUrl(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (path) {
      resolveSignedUrl('attachments', path).then(setUrl);
    } else {
      setUrl(null);
    }
  }, [path]);
  return url;
}

function MemberAvatar({ member }: { member: { full_name: string | null; email: string; avatar_url: string | null } }) {
  const avatarUrl = useAvatarUrl(member.avatar_url);
  return (
    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[color:var(--pragmata-accent)] to-[color:var(--pragmata-primary)] flex items-center justify-center text-white font-bold text-xs overflow-hidden flex-shrink-0">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        getInitials(member.full_name, member.email)
      )}
    </div>
  );
}

export default function ProjectMembersPanel({
  projectId,
  projectName,
  onClose,
  fetchProjectMembers,
  addProjectMember,
  removeProjectMember,
  canManage,
}: ProjectMembersPanelProps) {
  const { profile } = useAuth();
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddUser, setShowAddUser] = useState(false);
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [addingUserId, setAddingUserId] = useState<string | null>(null);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  // ── Load members ───────────────────────────────────────
  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchProjectMembers(projectId);
      setMembers(data);
    } catch (err: any) {
      console.error('Error loading members:', err.message);
    } finally {
      setLoading(false);
    }
  }, [projectId, fetchProjectMembers]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  // ── Load team users (for adding) ──────────────────────
  const loadTeamUsers = useCallback(async () => {
    if (!profile?.team_id) return;
    setLoadingTeam(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, role_id, sys_roles(name)')
        .eq('team_id', profile.team_id)
        .eq('status', 'active')
        .eq('profile_status', 'active')
        .order('full_name');

      if (error) throw error;

      setTeamUsers(
        (data || []).map((u: any) => ({
          id: u.id,
          full_name: u.full_name,
          email: u.email,
          avatar_url: u.avatar_url,
          role_name: u.sys_roles?.name || 'Sin rol',
        }))
      );
    } catch (err: any) {
      console.error('Error loading team users:', err.message);
    } finally {
      setLoadingTeam(false);
    }
  }, [profile?.team_id]);

  useEffect(() => {
    if (showAddUser) loadTeamUsers();
  }, [showAddUser, loadTeamUsers]);

  // ── Handlers ───────────────────────────────────────────
  const handleAdd = async (userId: string) => {
    setAddingUserId(userId);
    try {
      await addProjectMember(projectId, userId);
      await loadMembers();
      // If no more users to add, close add panel
    } catch (err: any) {
      alert('Error al agregar miembro: ' + err.message);
    } finally {
      setAddingUserId(null);
    }
  };

  const handleRemove = async (userId: string) => {
    if (!confirm('¿Estás seguro de quitar el acceso de este usuario al proyecto?')) return;
    setRemovingUserId(userId);
    try {
      await removeProjectMember(projectId, userId);
      await loadMembers();
    } catch (err: any) {
      alert('Error al quitar miembro: ' + err.message);
    } finally {
      setRemovingUserId(null);
    }
  };

  // Filter: users not already members
  const memberUserIds = new Set(members.map((m) => m.user_id));
  const availableUsers = teamUsers.filter(
    (u) =>
      !memberUserIds.has(u.id) &&
      (u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredMembers = members.filter(
    (m) =>
      !searchTerm ||
      m.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-[color:var(--pragmata-surface)] rounded-xl shadow-2xl max-w-lg w-full max-h-[80vh] overflow-hidden pointer-events-auto flex flex-col border border-[color:var(--pragmata-border)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-[color:var(--pragmata-border)] flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-[color:var(--pragmata-fg)]">Miembros del Proyecto</h2>
              <p className="text-sm text-[color:var(--pragmata-muted)] mt-0.5 truncate max-w-[300px]">{projectName}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              icon={<X className="h-5 w-5" />}
              className="text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-fg)]"
            />
          </div>

          {/* Toolbar */}
          <div className="px-6 py-3 border-b border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface-2)]/30 flex items-center gap-2">
            {!showAddUser ? (
              <>
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--pragmata-muted)]" />
                  <input
                    type="text"
                    placeholder="Buscar miembro..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-[color:var(--pragmata-surface)] border border-[color:var(--pragmata-border)] rounded-lg text-sm text-[color:var(--pragmata-fg)] placeholder:text-[color:var(--pragmata-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent transition-all"
                  />
                </div>
                {canManage && (
                  <Button size="sm" onClick={() => { setShowAddUser(true); setSearchTerm(''); }} icon={<UserPlus className="h-4 w-4" />}>
                    Agregar
                  </Button>
                )}
              </>
            ) : (
              <>
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--pragmata-muted)]" />
                  <input
                    type="text"
                    placeholder="Buscar usuario del equipo..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-[color:var(--pragmata-surface)] border border-[color:var(--pragmata-border)] rounded-lg text-sm text-[color:var(--pragmata-fg)] placeholder:text-[color:var(--pragmata-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent transition-all"
                    autoFocus
                  />
                </div>
                <Button variant="secondary" size="sm" onClick={() => { setShowAddUser(false); setSearchTerm(''); }}>
                  Volver
                </Button>
              </>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-[color:var(--pragmata-accent)]" />
              </div>
            ) : showAddUser ? (
              /* ── Add User List ────────────────────────── */
              <div className="divide-y divide-[color:var(--pragmata-border)]">
                {loadingTeam ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-[color:var(--pragmata-accent)]" />
                  </div>
                ) : availableUsers.length === 0 ? (
                  <div className="text-center py-12 text-sm text-[color:var(--pragmata-muted)]">
                    {searchTerm
                      ? 'No se encontraron usuarios disponibles'
                      : 'Todos los miembros del equipo ya están en el proyecto'}
                  </div>
                ) : (
                  availableUsers.map((user) => (
                    <div key={user.id} className="flex items-center gap-3 px-6 py-3 hover:bg-[color:var(--pragmata-row-hover)] transition-colors">
                      <MemberAvatar member={user} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[color:var(--pragmata-fg)] truncate">
                          {user.full_name || user.email}
                        </p>
                        <p className="text-xs text-[color:var(--pragmata-muted)] truncate">{user.email}</p>
                      </div>
                      <span className="text-[10px] font-medium text-[color:var(--pragmata-muted)] bg-[color:var(--pragmata-surface-2)] rounded-full px-2 py-0.5 flex-shrink-0">
                        {user.role_name}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAdd(user.id)}
                        loading={addingUserId === user.id}
                        icon={<UserPlus className="h-4 w-4" />}
                        className="text-[color:var(--pragmata-accent)] flex-shrink-0"
                      />
                    </div>
                  ))
                )}
              </div>
            ) : (
              /* ── Members List ─────────────────────────── */
              <div className="divide-y divide-[color:var(--pragmata-border)]">
                {filteredMembers.length === 0 ? (
                  <div className="text-center py-12 text-sm text-[color:var(--pragmata-muted)]">
                    {searchTerm ? 'No se encontraron miembros' : 'Este proyecto no tiene miembros aún'}
                  </div>
                ) : (
                  filteredMembers.map((member) => (
                    <div key={member.id} className="flex items-center gap-3 px-6 py-3 hover:bg-[color:var(--pragmata-row-hover)] transition-colors">
                      <MemberAvatar member={member} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[color:var(--pragmata-fg)] truncate">
                          {member.full_name || member.email}
                        </p>
                        <p className="text-xs text-[color:var(--pragmata-muted)] truncate">{member.email}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[10px] font-medium text-[color:var(--pragmata-muted)] bg-[color:var(--pragmata-surface-2)] rounded-full px-2 py-0.5 flex items-center gap-1">
                          <Shield className="h-3 w-3" />
                          {member.role_name}
                        </span>
                        {canManage && (
                          <Button
                            variant="danger-ghost"
                            size="sm"
                            onClick={() => handleRemove(member.user_id)}
                            loading={removingUserId === member.user_id}
                            icon={<Trash2 className="h-3.5 w-3.5" />}
                            className="opacity-0 group-hover:opacity-100"
                          />
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface-2)]/30">
            <p className="text-xs text-[color:var(--pragmata-muted)]">
              {members.length} miembro{members.length !== 1 ? 's' : ''} con acceso al proyecto
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
