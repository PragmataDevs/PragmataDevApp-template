import { useState, useRef, useEffect } from 'react';
import { NavLink, useMatch } from 'react-router-dom';
import { Menu, ChevronDown, User, LogOut, Globe } from 'lucide-react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { resolveSignedUrl } from '@/lib/storage';
import { getConfiguredPublicSiteUrl } from '@/lib/publicSiteUrl';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { ChatIcon } from '@/features/chat/components/ChatPanel';
import EntitySelector from '@/features/entities/components/EntitySelector';
import { MULTI_ENTITY_ENABLED } from '@/features/entities/types/entity';
import { OverlayPortal } from '@/lib/ui/OverlayPortal';
import { useAnchoredPosition } from '@/lib/ui/useAnchoredPosition';
import { useEscapeKey } from '@/lib/ui/useEscapeKey';

interface HeaderProps {
  onMenuClick: () => void;
}

const PUBLIC_SITE_URL = getConfiguredPublicSiteUrl();
/** Backport: `ChatIcon` se renderizaba incondicionalmente (bug del template). Default true. */
const CHAT_ENABLED = import.meta.env.VITE_ENABLE_CHAT !== 'false';

export function Header({ onMenuClick }: HeaderProps) {
  const { user, profile } = useAuth();
  const isInWorkspace = !!useMatch('/workspace/:entityId/*');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileAnchorRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [headerAvatarUrl, setHeaderAvatarUrl] = useState<string | null>(null);

  // Limpiar la URL firmada anterior se hace DURANTE el render, no dentro del
  // efecto: un setState síncrono en un useEffect provoca un render en cascada.
  // De paso se gana algo real — al cambiar de avatar ya no se ve el anterior
  // mientras se firma el nuevo.
  const avatarPath = profile?.avatar_url ?? null;
  const [lastAvatarPath, setLastAvatarPath] = useState(avatarPath);
  if (lastAvatarPath !== avatarPath) {
    setLastAvatarPath(avatarPath);
    setHeaderAvatarUrl(null);
  }

  // Firmar la URL sí va en un efecto: es asíncrono. El flag `cancel` evita que
  // la respuesta lenta de un avatar viejo pise a la del actual si el usuario
  // cambia de foto dos veces seguidas.
  useEffect(() => {
    if (!avatarPath) return;
    let cancel = false;
    resolveSignedUrl('attachments', avatarPath).then((url) => {
      if (!cancel) setHeaderAvatarUrl(url);
    });
    return () => {
      cancel = true;
    };
  }, [avatarPath]);

  // Cerrar menú perfil cuando se abre el panel de chat (misma zona del header)
  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (document.body.hasAttribute('data-chat-open')) {
        setIsProfileOpen(false);
      }
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-chat-open'] });
    return () => observer.disconnect();
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    if (!isProfileOpen) return;
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        profileAnchorRef.current?.contains(target) ||
        profileMenuRef.current?.contains(target)
      ) {
        return;
      }
      setIsProfileOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isProfileOpen]);

  useEscapeKey(isProfileOpen, () => setIsProfileOpen(false));

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    // Router/AuthGuard will handle redirect
  };

  const getInitials = () => {
    if (!profile?.full_name && !user?.email) return 'U';
    if (profile?.full_name) {
       return profile.full_name.substring(0, 2).toUpperCase();
    }
    return user?.email?.substring(0, 2).toUpperCase();
  };

  const profileMenuStyle = useAnchoredPosition({
    isOpen: isProfileOpen,
    anchorRef: profileAnchorRef,
    width: 224,
    align: 'right',
  });

  return (
    <header className="h-16 bg-[color:var(--pragmata-surface)] border-b border-[color:var(--pragmata-border)] flex items-center justify-between px-4 md:px-6 z-header sticky top-0">
      
      {/* Left: Mobile Menu + EntitySelector */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          data-mobile-menu-trigger
          onClick={onMenuClick}
          className="p-2 -ml-2 text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-fg)] md:hidden rounded-pragmata hover:bg-[color:var(--pragmata-surface-2)]"
        >
          <Menu className="w-6 h-6" />
        </button>

        {/* EntitySelector — only on workspace routes + multi-entity enabled */}
        {MULTI_ENTITY_ENABLED && isInWorkspace && (
          <div className="hidden sm:flex items-center">
            <EntitySelector />
          </div>
        )}
      </div>

      {/* Right: Actions & Profile */}
      <div className="flex items-center gap-2 md:gap-4">
        
        {/* Chat */}
        {CHAT_ENABLED && <ChatIcon />}

        {/* Notifications */}
        <NotificationBell />

        <div className="h-8 w-px bg-[color:var(--pragmata-border)] mx-1 hidden md:block"></div>

        {/* User Profile Dropdown */}
        <div className="relative" ref={profileAnchorRef}>
            <button 
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="flex items-center gap-2 p-1 rounded-full hover:bg-[color:var(--pragmata-surface-2)] border border-transparent hover:border-[color:var(--pragmata-border)] transition-all"
            >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[color:var(--pragmata-accent)] to-[color:var(--pragmata-primary)] flex items-center justify-center text-white font-bold text-xs ring-2 ring-[color:var(--pragmata-border)] shadow-sm overflow-hidden">
                    {headerAvatarUrl ? (
                      <img src={headerAvatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                    ) : (
                      getInitials()
                    )}
                </div>
                <div className="hidden md:block text-left mr-1">
                    <p className="text-xs font-semibold text-[color:var(--pragmata-fg)] leading-none">
                        {profile?.full_name || user?.email?.split('@')[0] || 'User'}
                    </p>
                    <p className="text-[10px] text-[color:var(--pragmata-muted)] leading-none mt-1 capitalize">
                        {profile?.access_level ?? '—'}
                    </p>
                </div>
                <ChevronDown className="w-4 h-4 text-[color:var(--pragmata-muted-2)] hidden md:block" />
            </button>

            {isProfileOpen && (
              <OverlayPortal layer="floating">
                <div
                  ref={profileMenuRef}
                  style={profileMenuStyle}
                  data-floating-menu
                  className="z-floating pointer-events-auto bg-[color:var(--pragmata-surface)] rounded-pragmata shadow-lg border border-[color:var(--pragmata-border)] py-1 origin-top-right animate-in fade-in zoom-in-95 duration-200"
                >
                    <div className="px-4 py-3 border-b border-[color:var(--pragmata-border)] md:hidden">
                      <p className="text-sm font-semibold text-[color:var(--pragmata-fg)]">{user?.email}</p>
                      <p className="text-xs text-[color:var(--pragmata-muted)] capitalize">{profile?.access_level}</p>
                    </div>

                    <div className="p-1">
                        <NavLink
                          to="/profile"
                            className="flex items-center gap-2 px-3 py-2 text-sm text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-fg)] hover:bg-[color:var(--pragmata-surface-2)] rounded-pragmata"
                            onClick={() => setIsProfileOpen(false)}
                        >
                            <User className="w-4 h-4" />
                            Mi Perfil
                        </NavLink>
                        {PUBLIC_SITE_URL && (
                          <a
                            href={PUBLIC_SITE_URL}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 px-3 py-2 text-sm text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-fg)] hover:bg-[color:var(--pragmata-surface-2)] rounded-pragmata"
                            onClick={() => setIsProfileOpen(false)}
                          >
                              <Globe className="w-4 h-4" />
                              Ir al sitio web
                          </a>
                        )}
                    </div>

                    <div className="border-t border-[color:var(--pragmata-border)] p-1 mt-1">
                        <button 
                            onClick={handleSignOut}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-pragmata transition-colors"
                        >
                            <LogOut className="w-4 h-4" />
                            Cerrar Sesión
                        </button>
                    </div>
                </div>
              </OverlayPortal>
            )}
        </div>
      </div>
    </header>
  );
}
