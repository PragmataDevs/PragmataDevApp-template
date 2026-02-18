import { useEffect, useState } from 'react';
import {
  Plus,
  Search,
  MoreVertical,
  Edit2,
  Trash2,
  Users as UsersIcon,
  FolderKanban,
  Loader2,
  AlertCircle,
  MapPin,
  CalendarDays,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  useProjects,
  PROJECT_STATUS_CONFIG,
  type ProjectWithMembers,
  type ProjectCreatePayload,
} from '@/features/projects/hooks/useProjects';
import { usePermission } from '@/features/auth/hooks/usePermission';
import ProjectFormModal from '@/features/projects/components/ProjectFormModal';
import ProjectMembersPanel from '@/features/projects/components/ProjectMembersPanel';

// ─── Helpers ─────────────────────────────────────────────────

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ─── Component ───────────────────────────────────────────────

export default function ProyectosPage() {
  const {
    projects,
    totalProjectCount,
    loading,
    error,
    createProject,
    updateProject,
    archiveProject,
    fetchProjectMembers,
    addProjectMember,
    removeProjectMember,
  } = useProjects();
  const { hasPermission } = usePermission();

  const canCreate = hasPermission('page_settings_proyectos', 'create');
  const canUpdate = hasPermission('page_settings_proyectos', 'update');
  const canDelete = hasPermission('page_settings_proyectos', 'delete');

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectWithMembers | null>(null);
  const [membersProject, setMembersProject] = useState<ProjectWithMembers | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Filters ────────────────────────────────────────────

  const filteredProjects = projects.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.location?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || p.project_status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // ── Handlers ───────────────────────────────────────────

  const handleCreateNew = () => {
    setEditingProject(null);
    setIsModalOpen(true);
  };

  const handleEdit = (project: ProjectWithMembers) => {
    setEditingProject(project);
    setIsModalOpen(true);
    setActiveDropdown(null);
    setDropdownPosition(null);
  };

  const handleDelete = async (project: ProjectWithMembers) => {
    setActiveDropdown(null);
    setDropdownPosition(null);
    if (!confirm(`¿Estás seguro de archivar "${project.name}"? Se puede restaurar después.`)) return;
    try {
      await archiveProject(project.id);
    } catch (err: any) {
      alert('Error al archivar: ' + err.message);
    }
  };

  const handleSave = async (data: ProjectCreatePayload) => {
    setSaving(true);
    try {
      if (editingProject) {
        await updateProject(editingProject.id, data);
      } else {
        await createProject(data);
      }
      setIsModalOpen(false);
      setEditingProject(null);
    } catch (err: any) {
      alert('Error al guardar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleViewMembers = (project: ProjectWithMembers) => {
    setMembersProject(project);
    setActiveDropdown(null);
    setDropdownPosition(null);
  };

  const handleToggleDropdown = (projectId: string, event: React.MouseEvent<HTMLButtonElement>) => {
    if (activeDropdown === projectId) {
      setActiveDropdown(null);
      setDropdownPosition(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 208; // w-52
    const estimatedMenuHeight = 170;
    const viewportPadding = 12;

    const canOpenDown = window.innerHeight - rect.bottom > estimatedMenuHeight;
    const top = canOpenDown
      ? rect.bottom + 8
      : Math.max(viewportPadding, rect.top - estimatedMenuHeight - 8);

    const left = Math.max(
      viewportPadding,
      Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - viewportPadding)
    );

    setDropdownPosition({ top, left });
    setActiveDropdown(projectId);
  };

  useEffect(() => {
    const close = () => {
      setActiveDropdown(null);
      setDropdownPosition(null);
    };

    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, []);

  // ── Status stats ───────────────────────────────────────

  const statusCounts = projects.reduce<Record<string, number>>((acc, p) => {
    acc[p.project_status] = (acc[p.project_status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="max-w-7xl mx-auto p-8">

      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FolderKanban className="w-5 h-5 text-[color:var(--pragmata-accent)]" />
            <h1 className="text-2xl font-bold text-[color:var(--pragmata-fg)]">Proyectos</h1>
          </div>
          <p className="text-[color:var(--pragmata-muted)]">
            Gestiona los proyectos de trabajo y controla el acceso de los miembros.
          </p>
        </div>
        {canCreate && (
          <Button onClick={handleCreateNew} icon={<Plus className="h-4 w-4" />}>
            Crear Proyecto
          </Button>
        )}
      </div>

      {/* Status Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-6">
        {Object.entries(PROJECT_STATUS_CONFIG).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setStatusFilter(statusFilter === key ? 'all' : key)}
            className={`rounded-xl border px-4 py-3 text-left transition-all ${
              statusFilter === key
                ? 'border-[color:var(--pragmata-accent)] bg-[color:var(--pragmata-accent-soft)] ring-1 ring-[color:var(--pragmata-accent)]'
                : 'border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface)] hover:border-[color:var(--pragmata-border-strong)]'
            }`}
          >
            <p className={`text-xl font-bold ${cfg.color}`}>{statusCounts[key] || 0}</p>
            <p className="text-xs text-[color:var(--pragmata-muted)] mt-0.5">{cfg.label}</p>
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-[color:var(--pragmata-accent)]" />
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="h-10 w-10 text-[color:var(--pragmata-danger)] mb-4" />
          <h3 className="text-lg font-medium text-[color:var(--pragmata-fg)]">Error al cargar proyectos</h3>
          <p className="text-[color:var(--pragmata-muted)] mt-1 max-w-sm">{error}</p>
        </div>
      ) : (
        <div className="bg-[color:var(--pragmata-surface)] rounded-xl border border-[color:var(--pragmata-border)] shadow-sm overflow-visible">

          {/* Toolbar */}
          <div className="p-4 border-b border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface-2)]/30">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--pragmata-muted)]" />
                <input
                  type="text"
                  placeholder="Buscar por nombre, código o ubicación..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-[color:var(--pragmata-surface)] border border-[color:var(--pragmata-border)] rounded-lg text-sm text-[color:var(--pragmata-fg)] placeholder:text-[color:var(--pragmata-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent transition-all"
                />
              </div>
              {statusFilter !== 'all' && (
                <Button variant="ghost" size="sm" onClick={() => setStatusFilter('all')}>
                  Limpiar filtro
                </Button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto overflow-y-visible">
            <table className="w-full">
              <thead className="bg-[color:var(--pragmata-surface-2)]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[color:var(--pragmata-muted)] uppercase tracking-wider">
                    Proyecto
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[color:var(--pragmata-muted)] uppercase tracking-wider hidden md:table-cell">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[color:var(--pragmata-muted)] uppercase tracking-wider hidden lg:table-cell">
                    Ubicación
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-[color:var(--pragmata-muted)] uppercase tracking-wider hidden sm:table-cell">
                    Miembros
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[color:var(--pragmata-muted)] uppercase tracking-wider hidden xl:table-cell">
                    Fechas
                  </th>
                  {(canUpdate || canDelete) && (
                    <th className="px-6 py-3 text-right text-xs font-semibold text-[color:var(--pragmata-muted)] uppercase tracking-wider">
                      Acciones
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--pragmata-border)]">
                {filteredProjects.map((project) => {
                  const statusCfg = PROJECT_STATUS_CONFIG[project.project_status];
                  return (
                    <tr
                      key={project.id}
                      className="hover:bg-[color:var(--pragmata-row-hover)] transition-colors group"
                    >
                      {/* Proyecto (nombre + código) */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-[color:var(--pragmata-accent-soft)]">
                            <FolderKanban className="h-4 w-4 text-[color:var(--pragmata-accent)]" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-[color:var(--pragmata-fg)] truncate">
                              {project.name}
                            </p>
                            {project.code && (
                              <p className="text-xs text-[color:var(--pragmata-muted)] font-mono">
                                {project.code}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Estado */}
                      <td className="px-6 py-4 hidden md:table-cell">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${statusCfg.bgClass} ${statusCfg.color}`}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {statusCfg.label}
                        </span>
                      </td>

                      {/* Ubicación */}
                      <td className="px-6 py-4 hidden lg:table-cell">
                        {project.location ? (
                          <span className="text-sm text-[color:var(--pragmata-muted)] flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="truncate max-w-[150px]">{project.location}</span>
                          </span>
                        ) : (
                          <span className="text-sm text-[color:var(--pragmata-muted-2)]">—</span>
                        )}
                      </td>

                      {/* Miembros */}
                      <td className="px-6 py-4 hidden sm:table-cell">
                        <button
                          onClick={() => handleViewMembers(project)}
                          className="flex items-center justify-center mx-auto"
                        >
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[color:var(--pragmata-surface-2)] border border-[color:var(--pragmata-border)] hover:border-[color:var(--pragmata-accent)] transition-colors cursor-pointer">
                            <UsersIcon className="h-3.5 w-3.5 text-[color:var(--pragmata-muted)]" />
                            <span className="text-xs font-medium text-[color:var(--pragmata-fg)]">
                              {project.member_count}
                            </span>
                          </div>
                        </button>
                      </td>

                      {/* Fechas */}
                      <td className="px-6 py-4 hidden xl:table-cell">
                        <div className="text-xs text-[color:var(--pragmata-muted)] space-y-0.5">
                          <p className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {formatDate(project.start_date)}
                          </p>
                          {project.end_date && (
                            <p className="flex items-center gap-1">
                              <CalendarDays className="h-3 w-3" />
                              {formatDate(project.end_date)}
                            </p>
                          )}
                        </div>
                      </td>

                      {/* Acciones */}
                      {(canUpdate || canDelete) && (
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="relative inline-block">
                            <button
                              onClick={(e) => handleToggleDropdown(project.id, e)}
                              className={`p-1.5 rounded-md text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-fg)] hover:bg-[color:var(--pragmata-surface-2)] transition-colors ${
                                activeDropdown === project.id
                                  ? 'bg-[color:var(--pragmata-surface-2)] text-[color:var(--pragmata-fg)]'
                                  : ''
                              }`}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>

                            {activeDropdown === project.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-[190]"
                                  onClick={() => {
                                    setActiveDropdown(null);
                                    setDropdownPosition(null);
                                  }}
                                />
                                <div
                                  className="fixed w-52 bg-[color:var(--pragmata-surface)] rounded-xl shadow-xl border border-[color:var(--pragmata-border)] z-[200] py-1 animate-in fade-in zoom-in-95 duration-100"
                                  style={{
                                    top: dropdownPosition?.top ?? 0,
                                    left: dropdownPosition?.left ?? 0,
                                  }}
                                >
                                  <button
                                    type="button"
                                    onClick={() => handleViewMembers(project)}
                                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[color:var(--pragmata-fg)] hover:bg-[color:var(--pragmata-surface-2)] transition-colors"
                                  >
                                    <UsersIcon className="h-4 w-4 shrink-0" />
                                    <span>Ver Miembros</span>
                                  </button>
                                  {canUpdate && (
                                    <button
                                      type="button"
                                      onClick={() => handleEdit(project)}
                                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[color:var(--pragmata-fg)] hover:bg-[color:var(--pragmata-surface-2)] transition-colors"
                                    >
                                      <Edit2 className="h-4 w-4 shrink-0" />
                                      <span>Editar Proyecto</span>
                                    </button>
                                  )}
                                  {canUpdate && canDelete && (
                                    <div className="h-px bg-[color:var(--pragmata-border)] mx-2 my-1" />
                                  )}
                                  {canDelete && (
                                    <button
                                      type="button"
                                      onClick={() => handleDelete(project)}
                                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[color:var(--pragmata-danger)] hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                                    >
                                      <Trash2 className="h-4 w-4 shrink-0" />
                                      <span>Archivar Proyecto</span>
                                    </button>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Empty State */}
          {filteredProjects.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="w-12 h-12 rounded-full bg-[color:var(--pragmata-surface-2)] flex items-center justify-center mb-4">
                <FolderKanban className="h-6 w-6 text-[color:var(--pragmata-muted)]" />
              </div>
              <h3 className="text-lg font-medium text-[color:var(--pragmata-fg)]">
                {searchTerm || statusFilter !== 'all'
                  ? 'No se encontraron proyectos'
                  : 'Sin proyectos aún'}
              </h3>
              <p className="text-[color:var(--pragmata-muted)] mt-1 max-w-sm">
                {searchTerm || statusFilter !== 'all'
                  ? 'Intenta con otros filtros de búsqueda.'
                  : 'Crea tu primer proyecto para empezar a organizar el trabajo.'}
              </p>
              {(searchTerm || statusFilter !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('all');
                  }}
                  className="mt-4 text-[color:var(--pragmata-accent)]"
                >
                  Limpiar filtros
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {isModalOpen && (
        <ProjectFormModal
          project={editingProject}
          onClose={() => {
            setIsModalOpen(false);
            setEditingProject(null);
          }}
          onSave={handleSave}
          saving={saving}
          totalProjects={totalProjectCount}
        />
      )}

      {membersProject && (
        <ProjectMembersPanel
          projectId={membersProject.id}
          projectName={membersProject.name}
          onClose={() => setMembersProject(null)}
          fetchProjectMembers={fetchProjectMembers}
          addProjectMember={addProjectMember}
          removeProjectMember={removeProjectMember}
          canManage={canUpdate}
        />
      )}
    </div>
  );
}
