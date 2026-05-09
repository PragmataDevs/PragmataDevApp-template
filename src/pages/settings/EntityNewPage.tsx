import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import EntityForm from '@/features/entities/components/EntityForm';
import { useEntities, type EntityInput } from '@/features/entities/hooks/useEntities';
import { usePermission } from '@/features/auth/hooks/usePermission';
import { ENTITY_LABEL, ENTITY_LABEL_PLURAL } from '@/types/entities/entity';

export default function EntityNewPage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermission();
  const canCreate = hasPermission('page_settings_entities', 'create');

  const { loading, totalEntityCount, createEntity } = useEntities();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!canCreate) {
      navigate('/settings/entities', { replace: true });
    }
  }, [canCreate, navigate]);

  const handleSave = async (data: EntityInput) => {
    setSaving(true);
    try {
      await createEntity(data);
      navigate('/settings/entities', { replace: true });
    } catch (err: unknown) {
      alert('Error al guardar: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  if (!canCreate) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 max-w-2xl mx-auto p-6">
        <Loader2 className="h-8 w-8 animate-spin text-[color:var(--pragmata-accent)]" />
      </div>
    );
  }

  const labelLower = ENTITY_LABEL.toLowerCase();

  return (
    <div className="max-w-2xl mx-auto p-6 flex flex-col gap-6">
      <PageHeader
        breadcrumbs={[
          { label: ENTITY_LABEL_PLURAL, to: '/settings/entities' },
          { label: `Nuevo ${labelLower}` },
        ]}
        title={`Nuevo ${ENTITY_LABEL}`}
        subtitle={`Define un ${labelLower} para agrupar trabajo en el workspace.`}
      />

      <div className="rounded-pragmata border border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface)] shadow-sm overflow-hidden flex flex-col min-h-[min(70vh,720px)]">
        <EntityForm
          entity={null}
          onCancel={() => navigate('/settings/entities')}
          onSave={handleSave}
          saving={saving}
          totalEntities={totalEntityCount}
        />
      </div>
    </div>
  );
}
