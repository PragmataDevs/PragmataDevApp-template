import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useTheme, type ThemeOption } from '@/features/preferences/providers/ThemeProvider';
import { supabase } from '@/lib/supabase';
import { uploadFile, deleteFile, resolveSignedUrl, AVATAR_PRESET } from '@/lib/storage';
import { Button } from '@/components/ui/Button';
import { Sun, Moon, Monitor, CheckCircle2, Camera, Loader2, Trash2 } from 'lucide-react';

const THEME_OPTIONS: { value: ThemeOption; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Oscuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
];

export default function ProfilePage() {
  const { user, profile, refreshProfile } = useAuth();
  const { theme, setTheme } = useTheme();

  // ── Profile form state ──
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);

  // ── Avatar state ──
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [removingAvatar, setRemovingAvatar] = useState(false);

  // Resolve signed URL for existing avatar on mount
  useEffect(() => {
    if (profile?.avatar_url) {
      resolveSignedUrl('attachments', profile.avatar_url).then(setAvatarUrl);
    } else {
      setAvatarUrl(null);
    }
  }, [profile?.avatar_url]);

  // ── Reset password state ──
  const [sendingReset, setSendingReset] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const getInitials = () => {
    if (profile?.full_name) return profile.full_name.slice(0, 2).toUpperCase();
    return user?.email?.slice(0, 2).toUpperCase() || 'U';
  };

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    // Show instant preview
    setAvatarPreview(URL.createObjectURL(file));
    setUploadingAvatar(true);

    try {
      const path = `avatars/${profile.id}.webp`;
      const { storagePath, signedUrl } = await uploadFile(
        'attachments',
        path,
        file,
        { optimize: AVATAR_PRESET, upsert: true }
      );

      // Save to profiles table
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: storagePath, updated_at: new Date().toISOString() })
        .eq('id', profile.id);

      if (error) throw error;

      setAvatarUrl(signedUrl);
      setAvatarPreview(null);
      await refreshProfile();
    } catch (err: any) {
      alert('Error al subir imagen: ' + err.message);
      setAvatarPreview(null);
    } finally {
      setUploadingAvatar(false);
      // Reset input so same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveAvatar = async () => {
    if (!profile?.avatar_url || !profile) return;
    setRemovingAvatar(true);

    try {
      // Delete from storage
      await deleteFile('attachments', profile.avatar_url);

      // Clear in profiles table
      const { error } = await supabase
        .from('profiles')
        .update({ avatar_url: null, updated_at: new Date().toISOString() })
        .eq('id', profile.id);

      if (error) throw error;

      setAvatarUrl(null);
      setAvatarPreview(null);
      await refreshProfile();
    } catch (err: any) {
      alert('Error al quitar imagen: ' + err.message);
    } finally {
      setRemovingAvatar(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!profile) return;
    setSavingProfile(true);
    setProfileSuccess(false);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: fullName || null,
          phone: phone || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', profile.id);

      if (error) throw error;
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err: any) {
      alert('Error al guardar: ' + err.message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleResetPassword = async () => {
    if (!user?.email) return;
    setSendingReset(true);
    setResetSent(false);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (error) throw error;
      setResetSent(true);
    } catch (err: any) {
      alert('Error al enviar: ' + err.message);
    } finally {
      setSendingReset(false);
    }
  };

  return (
    <div className="min-h-full bg-[color:var(--pragmata-bg)] text-[color:var(--pragmata-fg)]">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Mi Perfil</h1>
          <p className="text-sm text-[color:var(--pragmata-muted)] mt-2">
            Administra tu información personal, seguridad y preferencias.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Card: Información Personal */}
          <div className="bg-[color:var(--pragmata-surface)] rounded-2xl border border-[color:var(--pragmata-border)] shadow-sm">
            <div className="p-6 border-b border-[color:var(--pragmata-border)]">
              <h2 className="text-lg font-semibold">Información Personal</h2>
              <p className="text-xs text-[color:var(--pragmata-muted)] mt-1">
                Cambia tu nombre, teléfono y foto.
              </p>
            </div>

            <div className="p-6 space-y-6">
              {/* Avatar */}
              <div className="flex items-center gap-4">
                <div className="relative group">
                  {/* Avatar image or initials */}
                  <div className="h-16 w-16 rounded-full overflow-hidden bg-[color:var(--pragmata-surface-2)] border-2 border-[color:var(--pragmata-border)] flex items-center justify-center">
                    {avatarPreview || avatarUrl ? (
                      <img
                        src={avatarPreview || avatarUrl || ''}
                        alt="Avatar"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="text-sm font-semibold text-[color:var(--pragmata-primary)]">
                        {getInitials()}
                      </span>
                    )}
                  </div>

                  {/* Upload overlay on hover */}
                  {!uploadingAvatar && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <Camera className="h-5 w-5 text-white" />
                    </button>
                  )}

                  {/* Loading spinner */}
                  {uploadingAvatar && (
                    <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                      <Loader2 className="h-5 w-5 text-white animate-spin" />
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <p className="text-sm font-medium">Foto de perfil</p>
                  <div className="flex items-center gap-2">
                    <label
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg bg-[color:var(--pragmata-surface-2)] border border-[color:var(--pragmata-border)] text-xs text-[color:var(--pragmata-muted)] cursor-pointer hover:bg-[color:var(--pragmata-surface)] hover:text-[color:var(--pragmata-fg)] transition-colors"
                    >
                      {uploadingAvatar ? 'Subiendo...' : 'Subir foto'}
                    </label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={handleAvatarSelect}
                    />
                    {(avatarUrl || profile?.avatar_url) && (
                      <button
                        onClick={handleRemoveAvatar}
                        disabled={removingAvatar}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50"
                      >
                        {removingAvatar ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                        Quitar
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-[color:var(--pragmata-muted)]">
                    JPG, PNG o WebP. Se optimiza automáticamente.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-[color:var(--pragmata-muted)]">Nombre</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Tu nombre"
                    className="mt-1 w-full rounded-lg border border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface-2)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)]"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-[color:var(--pragmata-muted)]">Teléfono</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+52 000 000 0000"
                    className="mt-1 w-full rounded-lg border border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface-2)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)]"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-[color:var(--pragmata-muted)]">Email</label>
                  <input
                    type="email"
                    value={user?.email || ''}
                    disabled
                    className="mt-1 w-full rounded-lg border border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface-2)] px-3 py-2 text-sm text-[color:var(--pragmata-muted)]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3">
                {profileSuccess && (
                  <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Guardado
                  </span>
                )}
                <Button variant="accent" onClick={handleSaveProfile} loading={savingProfile}>
                  Guardar cambios
                </Button>
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Card: Seguridad */}
            <div className="bg-[color:var(--pragmata-surface)] rounded-2xl border border-[color:var(--pragmata-border)] shadow-sm">
              <div className="p-6 border-b border-[color:var(--pragmata-border)]">
                <h2 className="text-lg font-semibold">Seguridad</h2>
                <p className="text-xs text-[color:var(--pragmata-muted)] mt-1">
                  Cambia tu contraseña cuando lo necesites.
                </p>
              </div>
              <div className="p-6">
                <div className="rounded-lg bg-[color:var(--pragmata-surface-2)] border border-[color:var(--pragmata-border)] p-4">
                  <p className="text-sm font-medium">Restablecer contraseña</p>
                  <p className="text-xs text-[color:var(--pragmata-muted)] mt-1">
                    Te enviaremos un correo con el enlace de reseteo.
                  </p>

                  {resetSent ? (
                    <div className="mt-4 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Correo enviado a <strong>{user?.email}</strong></span>
                    </div>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-4"
                      onClick={handleResetPassword}
                      loading={sendingReset}
                    >
                      Enviar email de reseteo
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Card: Preferencias */}
            <div className="bg-[color:var(--pragmata-surface)] rounded-2xl border border-[color:var(--pragmata-border)] shadow-sm">
              <div className="p-6 border-b border-[color:var(--pragmata-border)]">
                <h2 className="text-lg font-semibold">Preferencias</h2>
                <p className="text-xs text-[color:var(--pragmata-muted)] mt-1">
                  Personaliza la apariencia de la aplicación.
                </p>
              </div>
              <div className="p-6">
                <label className="text-xs font-medium text-[color:var(--pragmata-muted)] mb-3 block">
                  Tema
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {THEME_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const isActive = theme === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setTheme(opt.value)}
                        className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                          isActive
                            ? 'border-[color:var(--pragmata-accent)] bg-[color:var(--pragmata-accent-soft)]'
                            : 'border-[color:var(--pragmata-border)] hover:border-[color:var(--pragmata-border-strong)] bg-[color:var(--pragmata-surface-2)]'
                        }`}
                      >
                        <Icon
                          className={`h-5 w-5 ${
                            isActive
                              ? 'text-[color:var(--pragmata-accent)]'
                              : 'text-[color:var(--pragmata-muted)]'
                          }`}
                        />
                        <span
                          className={`text-xs font-medium ${
                            isActive
                              ? 'text-[color:var(--pragmata-accent)]'
                              : 'text-[color:var(--pragmata-muted)]'
                          }`}
                        >
                          {opt.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
