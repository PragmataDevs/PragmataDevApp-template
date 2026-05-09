import { X } from 'lucide-react';
import UserForm, { type UserFormProps } from '@/features/users/components/UserForm';

type UserFormModalProps = Omit<UserFormProps, 'onCancel'> & {
  onClose: () => void;
};

export default function UserFormModal({ user, onClose, ...rest }: UserFormModalProps) {
  const isEditing = !!user;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-[color:var(--pragmata-surface)] rounded-2xl shadow-2xl border border-[color:var(--pragmata-border)] w-full max-w-3xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between p-6 border-b border-[color:var(--pragmata-border)]">
            <h2 className="text-lg font-bold text-[color:var(--pragmata-fg)]">
              {isEditing ? 'Editar Usuario' : 'Crear Usuario'}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-fg)] hover:bg-[color:var(--pragmata-surface-2)] transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <UserForm {...rest} user={user} onCancel={onClose} />
        </div>
      </div>
    </>
  );
}
