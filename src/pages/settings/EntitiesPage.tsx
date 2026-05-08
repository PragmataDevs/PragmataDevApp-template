import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Search,
  MoreVertical,
  Edit2,
  Trash2,
  Users as UsersIcon,
  Layers,
  Loader2,
  AlertCircle,
  MapPin,
  CalendarDays,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  useEntities,
  ENTITY_STATUS_CONFIG,
  type EntityWithMembers,
  type EntityInput,
} from '@/features/entities/hooks/useEntities';
import { usePermission } from '@/features/auth/hooks/usePermission';
import { ENTITY_LABEL } from '@/types/entities/entity';
import ProjectFormModal from '@/features/projects/components/ProjectFormModal';
import ProjectMembersPanel from '@/features/projects/components/ProjectMembersPanel';

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('es-MX', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export default function EntitiesPage() {
  const {
    entities,
    totalEntityCount,
    loading,
    error,
    createEntity,
    updateEntity,
    archiveEntity,
    fetchEntityMembers,
    addEntityMember,
    removeEntityMember,
  } = useEntities();
  const { hasPermission } = usePermission();

  const canCreate = hasPermission('page_settings_entities', 'create');
  const canUpdate = hasPermission('page_settings_entities', 'update');
  const canDelete  = hasPermission('page_settings_entities', 'delete');

  const [searchTerm, setSearchTerm]     = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen]   = useState(false);
  const [editingEntity, setEditingEntity] = useState<EntityWithMembers | null>(null);
  const [membersEntity, setMembersEntity] = useState<EntityWithMembers | null>(null);
  const [activeDropdown, setActiveDropdown]       = useState<string | null>(null);
  const [dropdownPosition, setDropdownPosition]   = useState<{ top: number; left: number } | null>(null);
  const [saving, setSaving] = useState(false);

  const filteredEntities = entities.filter((e) => {
    const matchesSearch =
      e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.location?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || e.entity_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleEdit = (entity: EntityWithMembers) => {
    setEditingEntity(entity);
    setIsModalOpen(true);
    setActiveDropdown(null);
    setDropdownPosition(null);
  };

  const handleDelete = async (entity: EntityWithMembers) => {
    setActiveDropdown(null);
    setDropdownPosition(null);
    if (!confirm(`¿Estás seguro de archivar "${entity.name}"?`)) return;
    try { await archiveEntity(entity.id); } catch (err: any) { alert('Error: ' + err.message); }
  };

  const handleSave = async (data: EntityInput) => {
    setSaving(true);
    try {
      if (editingEntity) {
        await updateEntity(editingEntity.id, data);
      } else {
        await createEntity(data);
      }
      setIsModalOpen(false);
      setEditingEntity(null);
    } catch (err: any) {
      alert('Error al guardar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleViewMembers = (entity: EntityWithMembers) => {
    setMembersEntity(entity);
    setActiveDropdown(null);
    setDropdownPosition(null);
  };

  const handleToggleDropdown = (entityId: string, event: React.MouseEvent<HTMLButtonElement>) => {
    if (activeDropdown === entityId) { setActiveDropdown(null); setDropdownPosition(null); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 208;
    const estimatedMenuHeight = 200;
    const viewportPadding = 12;
    const canOpenDown = window.innerHeight - rect.bottom > estimatedMenuHeight;
    const top = canOpenDown ? rect.bottom + 8 : Math.max(viewportPadding, rect.top - estimatedMenuHeight - 8);
    const left = Math.max(viewportPadding, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - viewportPadding));
    setDropdownPosition({ top, left });
    setActiveDropdown(entityId);
  };

  useEffect(() => {
    const close = () => { setActiveDropdown(null); setDropdownPosition(null); };
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true); };
  }, []);

  const statusCounts = entities.reduce<Record<string, number>>((acc, e) => {
    acc[e.entity_status] = (acc[e.entity_status] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="max-w-7xl mx-auto p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-5 h-5 text-[color:var(--pragmata-accent)]" />
            <h1 className="text-2xl font-bold text-[color:var(--pragmata-fg)]">{ENTITY_LABEL}s</h1>
          </div>
          <p className="text-[color:var(--pragmata-muted)]">
            Gestiona las entidades de trabajo y controla el acceso de los miembros.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => { setEditingEntity(null); setIsModalOpen(true); }} icon={<Plus className="h-4 w-4" />}>
            Crear {ENTITY_LABEL}
          </Button>
        )}
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-6">
        {Object.entries(ENTITY_STATUS_CONFIG).map(([key, cfg]) => (
          <button
            key={key}
            onClick={() => setStatusFilter(statusFilter === key ? 'all' : key)}
            className={`rounded-pragmata border px-4 py-3 text-left transition-all ${
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
          <p className="text-[color:var(--pragmata-muted)]">{error}</p>
        </div>
      ) : (
        <div className="bg-[color:var(--pragmata-surface)] rounded-pragmata border border-[color:var(--pragmata-border)] shadow-sm overflow-visible">

          {/* Toolbar */}
          <div className="p-4 border-b border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface-2)]/30">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--pragmata-muted)]" />
                <input
                  type="text"
                  placeholder={`Buscar ${ENTITY_LABEL.toLowerCase()} por nombre, código o ubicación...`}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-[color:var(--pragmata-surface)] border border-[color:var(--pragmata-border)] rounded-pragmata text-sm text-[color:var(--pragmata-fg)] placeholder:text-[color:var(--pragmata-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent"
                />
              </div>
              {statusFilter !== 'all' && (
                <Button variant="ghost" size="sm" onClick={() => setStatusFilter('all')}>Limpiar filtro</Button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto overflow-y-visible">
            <table className="w-full">
              <thead className="bg-[color:var(--pragmata-surface-2)]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[color:var(--pragmata-muted)] uppercase tracking-wider">{ENTITY_LABEL}</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[color:var(--pragmata-muted)] uppercase tracking-wider hidden md:table-cell">Estado</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[color:var(--pragmata-muted)] uppercase tracking-wider hidden lg:table-cell">Ubicación</th>
                  <th className="px-6 py-3 text-center text-xs font-semibold text-[color:var(--pragmata-muted)] uppercase tracking-wider hidden sm:table-cell">Miembros</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-[color:var(--pragmata-muted)] uppercase tracking-wider hidden xl:table-cell">Fechas</th>
                  {(canUpdate || canDelete) && (
                    <th className="px-6 py-3 text-right text-xs font-semibold text-[color:var(--pragmata-muted)] uppercase tracking-wider">Acciones</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--pragmata-border)]">
                {filteredEntities.map((entity) => {
                  const statusCfg = ENTITY_STATUS_CONFIG[entity.entity_status];
                  return (
                    <tr key={entity.id} className="hover:bg-[color:var(--pragmata-row-hover)] transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-[color:var(--pragmata-accent-soft)]">
                            <Layers className="h-4 w-4 text-[color:var(--pragmata-accent)]" />
                          </div>
                          <div className="min-w-0">
                            <Link
                              to={`/workspace/${entity.id}/dashboard`}
                              className="font-medium text-[color:var(--pragmata-fg)] hover:text-[color:var(--pragmata-accent)] truncate flex items-center gap-1 group/link"
                            >
                              {entity.name}
                              <ExternalLink className="w-3 h-3 opacity-0 group-hover/link:opacity-100 transition-opacity flex-shrink-0" />
                            </Link>
                            {entity.code && (
                              <p className="text-xs text-[color:var(--pragmata-muted)] font-mono">{entity.code}</p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 hidden md:table-cell">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${statusCfg.bgClass} ${statusCfg.color}`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-current" />
                          {statusCfg.label}
                        </span>
                      </td>

                      <td className="px-6 py-4 hidden lg:table-cell">
                        {entity.location ? (
                          <span className="text-sm text-[color:var(--pragmata-muted)] flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="truncate max-w-[150px]">{entity.location}</span>
                          </span>
                        ) : (
                          <span className="text-sm text-[color:var(--pragmata-muted-2)]">—</span>
                        )}
                      </td>

                      <td className="px-6 py-4 hidden sm:table-cell">
                        <button onClick={() => handleViewMembers(entity)} className="flex items-center justify-center mx-auto">
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[color:var(--pragmata-surface-2)] border border-[color:var(--pragmata-border)] hover:border-[color:var(--pragmata-accent)] transition-colors cursor-pointer">
                            <UsersIcon className="h-3.5 w-3.5 text-[color:var(--pragmata-muted)]" />
                            <span className="text-xs font-medium text-[color:var(--pragmata-fg)]">{entity.member_count}</span>
                          </div>
                        </button>
                      </td>

                      <td className="px-6 py-4 hidden xl:table-cell">
                        <div className="text-xs text-[color:var(--pragmata-muted)] space-y-0.5">
                          <p className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{formatDate(entity.start_date)}</p>
                          {entity.end_date && <p className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{formatDate(entity.end_date)}</p>}
                        </div>
                      </td>

                      {(canUpdate || canDelete) && (
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="relative inline-block">
                            <button
                              onClick={(e) => handleToggleDropdown(entity.id, e)}
                              className={`p-1.5 rounded-md text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-fg)] hover:bg-[color:var(--pragmata-surface-2)] transition-colors ${activeDropdown === entity.id ? 'bg-[color:var(--pragmata-surface-2)] text-[color:var(--pragmata-fg)]' : ''}`}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>

                            {activeDropdown === entity.id && (
                              <>
                                <div className="fixed inset-0 z-[190]" onClick={() => { setActiveDropdown(null); setDropdownPosition(null); }} />
                                <div
                                  className="fixed w-52 bg-[color:var(--pragmata-surface)] rounded-pragmata shadow-xl border border-[color:var(--pragmata-border)] z-[200] py-1 animate-in fade-in zoom-in-95 duration-100"
                                  style={{ top: dropdownPosition?.top ?? 0, left: dropdownPosition?.left ?? 0 }}
                                >
                                  <Link
                                    to={`/workspace/${entity.id}/dashboard`}
                                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[color:var(--pragmata-accent)] hover:bg-[color:var(--pragmata-accent-soft)] transition-colors"
                                    onClick={() => { setActiveDropdown(null); setDropdownPosition(null); }}
                                  >
                                    <ExternalLink className="h-4 w-4 shrink-0" />
                                    <span>Abrir workspace</span>
                                  </Link>
                                  <div className="h-px bg-[color:var(--pragmata-border)] mx-2 my-1" />
                                  <button type="button" onClick={() => handleViewMembers(entity)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[color:var(--pragmata-fg)] hover:bg-[color:var(--pragmata-surface-2)] transition-colors">
                                    <UsersIcon className="h-4 w-4 shrink-0" /><span>Ver Miembros</span>
                                  </button>
                                  {canUpdate && (
                                    <button type="button" onClick={() => handleEdit(entity)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[color:var(--pragmata-fg)] hover:bg-[color:var(--pragmata-surface-2)] transition-colors">
                                      <Edit2 className="h-4 w-4 shrink-0" /><span>Editar</span>
                                    </button>
                                  )}
                                  {canUpdate && canDelete && <div className="h-px bg-[color:var(--pragmata-border)] mx-2 my-1" />}
                                  {canDelete && (
                                    <button type="button" onClick={() => handleDelete(entity)} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[color:var(--pragmata-danger)] hover:bg-red-50 transition-colors">
                                      <Trash2 className="h-4 w-4 shrink-0" /><span>Archivar</span>
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

          {filteredEntities.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <div className="w-12 h-12 rounded-full bg-[color:var(--pragmata-surface-2)] flex items-center justify-center mb-4">
                <Layers className="h-6 w-6 text-[color:var(--pragmata-muted)]" />
              </div>
              <h3 className="text-lg font-medium text-[color:var(--pragmata-fg)]">
                {searchTerm || statusFilter !== 'all' ? 'No se encontraron entidades' : `Sin ${ENTITY_LABEL.toLowerCase()}s aún`}
              </h3>
              <p className="text-[color:var(--pragmata-muted)] mt-1 max-w-sm">
                {searchTerm || statusFilter !== 'all' ? 'Intenta con otros filtros.' : `Crea tu primer ${ENTITY_LABEL.toLowerCase()} para empezar.`}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Modals — reuse ProjectFormModal/ProjectMembersPanel until entity-specific ones are built */}
      {isModalOpen && (
        <ProjectFormModal
          project={editingEntity as any}
          onClose={() => { setIsModalOpen(false); setEditingEntity(null); }}
          onSave={handleSave as any}
          saving={saving}
          totalProjects={totalEntityCount}
        />
      )}

      {membersEntity && (
        <ProjectMembersPanel
          projectId={membersEntity.id}
          projectName={membersEntity.name}
          onClose={() => setMembersEntity(null)}
          fetchProjectMembers={fetchEntityMembers as any}
          addProjectMember={addEntityMember}
          removeProjectMember={removeEntityMember}
          canManage={canUpdate}
        />
      )}
    </div>
  );
}
