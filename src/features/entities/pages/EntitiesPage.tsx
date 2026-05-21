import { useEffect, useState, useMemo, useCallback, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
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
import { DataTable, type ColumnDef } from '@/components/ui/DataTable';
import {
  useEntities,
  ENTITY_STATUS_CONFIG,
  type EntityWithMembers,
  type EntityInput,
} from '@/features/entities/hooks/useEntities';
import { usePermission } from '@/features/auth/hooks/usePermission';
import { ENTITY_LABEL, ENTITY_LABEL_PLURAL } from '@/features/entities/types/entity';
import EntityFormModal from '@/features/entities/components/EntityFormModal';
import EntityMembersPanel from '@/features/entities/components/EntityMembersPanel';

const ENTITY_CSV_FIELDS = [
  'id',
  'name',
  'code',
  'description',
  'entity_status',
  'location',
  'budget',
  'start_date',
  'end_date',
  'team_id',
  'member_count',
] as const;

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function EntityRowMenu({
  entity,
  canUpdate,
  canDelete,
  onEdit,
  onDelete,
  onMembers,
}: {
  entity: EntityWithMembers;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: (e: EntityWithMembers) => void;
  onDelete: (e: EntityWithMembers) => void;
  onMembers: (e: EntityWithMembers) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (e: ReactMouseEvent<HTMLButtonElement>) => {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = 208;
    const estimatedMenuHeight = 200;
    const viewportPadding = 12;
    const canOpenDown = window.innerHeight - rect.bottom > estimatedMenuHeight;
    const top = canOpenDown
      ? rect.bottom + 8
      : Math.max(viewportPadding, rect.top - estimatedMenuHeight - 8);
    const left = Math.max(
      viewportPadding,
      Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - viewportPadding),
    );
    setPos({ top, left });
    setOpen(true);
  };

  if (!canUpdate && !canDelete) return null;

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        className={`p-1.5 rounded-md text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-fg)] hover:bg-[color:var(--pragmata-surface-2)] transition-colors ${open ? 'bg-[color:var(--pragmata-surface-2)] text-[color:var(--pragmata-fg)]' : ''}`}
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
            className="fixed w-52 bg-[color:var(--pragmata-surface)] rounded-pragmata shadow-xl border border-[color:var(--pragmata-border)] py-1"
          >
            <Link
              to={`/workspace/${entity.id}/dashboard`}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[color:var(--pragmata-accent)] hover:bg-[color:var(--pragmata-accent-soft)] transition-colors"
              onClick={() => setOpen(false)}
            >
              <ExternalLink className="h-4 w-4 shrink-0" />
              <span>Abrir workspace</span>
            </Link>
            <div className="h-px bg-[color:var(--pragmata-border)] mx-2 my-1" />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onMembers(entity);
              }}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[color:var(--pragmata-fg)] hover:bg-[color:var(--pragmata-surface-2)] transition-colors"
            >
              <UsersIcon className="h-4 w-4 shrink-0" />
              <span>Ver Miembros</span>
            </button>
            {canUpdate && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onEdit(entity);
                }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[color:var(--pragmata-fg)] hover:bg-[color:var(--pragmata-surface-2)] transition-colors"
              >
                <Edit2 className="h-4 w-4 shrink-0" />
                <span>Editar</span>
              </button>
            )}
            {canUpdate && canDelete && <div className="h-px bg-[color:var(--pragmata-border)] mx-2 my-1" />}
            {canDelete && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onDelete(entity);
                }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-[color:var(--pragmata-danger)] hover:bg-red-50 transition-colors"
              >
                <Trash2 className="h-4 w-4 shrink-0" />
                <span>Archivar</span>
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

export default function EntitiesPage() {
  const navigate = useNavigate();

  const {
    entities,
    loading,
    error,
    updateEntity,
    archiveEntity,
    fetchEntityMembers,
    addEntityMember,
    removeEntityMember,
  } = useEntities();
  const { hasPermission } = usePermission();

  const canCreate = hasPermission('page_settings_entities', 'create');
  const canUpdate = hasPermission('page_settings_entities', 'update');
  const canDelete = hasPermission('page_settings_entities', 'delete');

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<EntityWithMembers | null>(null);
  const [membersEntity, setMembersEntity] = useState<EntityWithMembers | null>(null);
  const [saving, setSaving] = useState(false);

  const tableEntities = useMemo(() => {
    return entities.filter(e => statusFilter === 'all' || e.entity_status === statusFilter);
  }, [entities, statusFilter]);

  const handleEdit = useCallback((entity: EntityWithMembers) => {
    setEditingEntity(entity);
    setIsModalOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (entity: EntityWithMembers) => {
      if (!confirm(`¿Estás seguro de archivar "${entity.name}"?`)) return;
      try {
        await archiveEntity(entity.id);
      } catch (err: unknown) {
        alert('Error: ' + (err instanceof Error ? err.message : String(err)));
      }
    },
    [archiveEntity],
  );

  const handleSave = async (data: EntityInput) => {
    if (!editingEntity) return;
    setSaving(true);
    try {
      await updateEntity(editingEntity.id, data);
      setIsModalOpen(false);
      setEditingEntity(null);
    } catch (err: unknown) {
      alert('Error al guardar: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  const handleViewMembers = useCallback((entity: EntityWithMembers) => {
    setMembersEntity(entity);
  }, []);

  const statusCounts = entities.reduce<Record<string, number>>((acc, e) => {
    acc[e.entity_status] = (acc[e.entity_status] || 0) + 1;
    return acc;
  }, {});

  const columns = useMemo((): ColumnDef<EntityWithMembers>[] => {
    return [
      {
        key: 'name',
        header: ENTITY_LABEL,
        width: 260,
        render: (_v, row) => (
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-[color:var(--pragmata-accent-soft)] shrink-0">
              <Layers className="h-4 w-4 text-[color:var(--pragmata-accent)]" />
            </div>
            <div className="min-w-0">
              <Link
                to={`/workspace/${row.id}/dashboard`}
                className="font-medium text-[color:var(--pragmata-fg)] hover:text-[color:var(--pragmata-accent)] truncate flex items-center gap-1 group/link"
              >
                {row.name}
                <ExternalLink className="w-3 h-3 opacity-0 group-hover/link:opacity-100 transition-opacity shrink-0" />
              </Link>
              {row.code && (
                <p className="text-xs text-[color:var(--pragmata-muted)] font-mono truncate">{row.code}</p>
              )}
            </div>
          </div>
        ),
      },
      {
        key: 'entity_status',
        header: 'Estado',
        width: 140,
        render: (_v, row) => {
          const cfg = ENTITY_STATUS_CONFIG[row.entity_status];
          return (
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bgClass} ${cfg.color}`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              {cfg.label}
            </span>
          );
        },
      },
      {
        key: 'location',
        header: 'Ubicación',
        width: 180,
        render: (val) =>
          val ? (
            <span className="text-sm text-[color:var(--pragmata-muted)] flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate max-w-[160px]">{String(val)}</span>
            </span>
          ) : (
            <span className="text-sm text-[color:var(--pragmata-muted-2)]">—</span>
          ),
      },
      {
        key: 'member_count',
        header: 'Miembros',
        width: 110,
        render: (_v, row) => (
          <button
            type="button"
            onClick={() => handleViewMembers(row)}
            className="flex items-center justify-center mx-auto"
          >
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[color:var(--pragmata-surface-2)] border border-[color:var(--pragmata-border)] hover:border-[color:var(--pragmata-accent)] transition-colors cursor-pointer">
              <UsersIcon className="h-3.5 w-3.5 text-[color:var(--pragmata-muted)]" />
              <span className="text-xs font-medium text-[color:var(--pragmata-fg)]">{row.member_count}</span>
            </div>
          </button>
        ),
      },
      {
        key: 'start_date',
        header: 'Fechas',
        width: 180,
        render: (_v, row) => (
          <div className="text-xs text-[color:var(--pragmata-muted)] space-y-0.5">
            <p className="flex items-center gap-1">
              <CalendarDays className="h-3 w-3 shrink-0" />
              {formatDate(row.start_date)}
            </p>
            {row.end_date && (
              <p className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3 shrink-0" />
                {formatDate(row.end_date)}
              </p>
            )}
          </div>
        ),
      },
    ];
  }, [handleViewMembers]);

  const rowActions = useCallback(
    (row: EntityWithMembers) => (
      <EntityRowMenu
        entity={row}
        canUpdate={canUpdate}
        canDelete={canDelete}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onMembers={handleViewMembers}
      />
    ),
    [canUpdate, canDelete, handleEdit, handleDelete, handleViewMembers],
  );

  return (
    <div className="max-w-7xl mx-auto p-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Layers className="w-5 h-5 text-[color:var(--pragmata-accent)]" />
            <h1 className="text-2xl font-bold text-[color:var(--pragmata-fg)]">{ENTITY_LABEL_PLURAL}</h1>
          </div>
          <p className="text-[color:var(--pragmata-muted)]">
            Gestiona las entidades de trabajo y controla el acceso de los miembros.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => navigate('/settings/entities/nuevo')} icon={<Plus className="h-4 w-4" />}>
            Crear {ENTITY_LABEL}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-6">
        {Object.entries(ENTITY_STATUS_CONFIG).map(([key, cfg]) => (
          <button
            key={key}
            type="button"
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

      {statusFilter !== 'all' && (
        <div className="mb-4">
          <Button variant="ghost" size="sm" onClick={() => setStatusFilter('all')}>
            Limpiar filtro de estado
          </Button>
        </div>
      )}

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
        <DataTable<EntityWithMembers>
          data={tableEntities}
          columns={columns}
          rowKey="id"
          actions={canUpdate || canDelete ? rowActions : undefined}
          csv={{ filename: 'entities', fields: [...ENTITY_CSV_FIELDS] }}
          emptyMessage={
            statusFilter !== 'all'
              ? `No hay ${ENTITY_LABEL_PLURAL.toLowerCase()} en este estado`
              : `Sin ${ENTITY_LABEL_PLURAL.toLowerCase()} aún`
          }
          emptyDescription={
            statusFilter !== 'all'
              ? 'Prueba otro estado o limpia el filtro.'
              : `Crea tu primer ${ENTITY_LABEL.toLowerCase()} para empezar.`
          }
        />
      )}

      {isModalOpen && editingEntity && (
        <EntityFormModal
          entity={editingEntity}
          onClose={() => {
            setIsModalOpen(false);
            setEditingEntity(null);
          }}
          onSave={handleSave}
          saving={saving}
        />
      )}

      {membersEntity && (
        <EntityMembersPanel
          entityId={membersEntity.id}
          entityName={membersEntity.name}
          onClose={() => setMembersEntity(null)}
          fetchEntityMembers={fetchEntityMembers}
          addEntityMember={addEntityMember}
          removeEntityMember={removeEntityMember}
          canManage={canUpdate}
        />
      )}
    </div>
  );
}
