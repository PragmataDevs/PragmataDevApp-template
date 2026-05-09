import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import EntityForm, { type EntityFormProps } from '@/features/entities/components/EntityForm';
import { ENTITY_LABEL } from '@/types/entities/entity';

type EntityFormModalProps = Omit<EntityFormProps, 'onCancel'> & {
  onClose: () => void;
};

export default function EntityFormModal({ entity, onClose, ...rest }: EntityFormModalProps) {
  const isEditing = !!entity;
  const labelLower = ENTITY_LABEL.toLowerCase();

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="bg-[color:var(--pragmata-surface)] rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden pointer-events-auto flex flex-col border border-[color:var(--pragmata-border)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 py-4 border-b border-[color:var(--pragmata-border)] flex items-center justify-between bg-[color:var(--pragmata-surface)] shrink-0">
            <div>
              <h2 className="text-xl font-bold text-[color:var(--pragmata-fg)]">
                {isEditing ? `Editar ${ENTITY_LABEL}` : `Nuevo ${ENTITY_LABEL}`}
              </h2>
              <p className="text-sm text-[color:var(--pragmata-muted)] mt-1">
                {isEditing
                  ? `Actualiza los datos de este ${labelLower}`
                  : `Define un ${labelLower} para agrupar trabajo en el workspace`}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              icon={<X className="h-5 w-5" />}
              className="text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-fg)]"
            />
          </div>

          <EntityForm {...rest} entity={entity} onCancel={onClose} />
        </div>
      </div>
    </>
  );
}
