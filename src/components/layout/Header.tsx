import { useState, useRef, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Menu, ChevronDown, User, LogOut } from 'lucide-react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { resolveSignedUrl } from '@/lib/storage';
import { NotificationBell } from '@/features/notifications/components/NotificationBell';
import { ChatIcon } from '@/features/chat/components/ChatPanel';
import ProjectSelector from '@/features/projects/components/ProjectSelector';

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { user, profile } = useAuth();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [headerAvatarUrl, setHeaderAvatarUrl] = useState<string | null>(null);

  // Resolve avatar signed URL
  useEffect(() => {
    if (profile?.avatar_url) {
      resolveSignedUrl('attachments', profile.avatar_url).then(setHeaderAvatarUrl);
    } else {
      setHeaderAvatarUrl(null);
    }
  }, [profile?.avatar_url]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  return (
    <header className="h-16 bg-[color:var(--pragmata-surface)] border-b border-[color:var(--pragmata-border)] flex items-center justify-between px-4 md:px-6 z-20 sticky top-0">
      
      {/* Left: Mobile Menu & Project Selector */}
      <div className="flex items-center gap-4">
        <button 
          onClick={onMenuClick}
          className="p-2 -ml-2 text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-fg)] md:hidden rounded-pragmata hover:bg-[color:var(--pragmata-surface-2)]"
        >
          <Menu className="w-6 h-6" />
        </button>

        {/* Project Selector */}
        <div className="hidden md:flex items-center">
            <ProjectSelector />
        </div>
      </div>

      {/* Right: Actions & Profile */}
      <div className="flex items-center gap-2 md:gap-4">
        
        {/* Chat */}
        <ChatIcon />

        {/* Notifications */}
        <NotificationBell />

        <div className="h-8 w-px bg-[color:var(--pragmata-border)] mx-1 hidden md:block"></div>

        {/* User Profile Dropdown */}
        <div className="relative" ref={dropdownRef}>
            <button 
                onClick={() => setIsProfileOpen(!isProfileOpen)}
                className="flex items-center gap-2 p-1 rounded-full hover:bg-[color:var(--pragmata-surface-2)] border border-transparent hover:border-[color:var(--pragmata-border)] transition-all"
            >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[color:var(--pragmata-accent)] to-[color:var(--pragmata-primary)] flex items-center justify-center text-white font-bold text-xs ring-2 ring-white shadow-sm overflow-hidden">
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
                        {profile?.access_level || 'Member'}
                    </p>
                </div>
                <ChevronDown className="w-4 h-4 text-[color:var(--pragmata-muted-2)] hidden md:block" />
            </button>

            {/* Dropdown Menu */}
            {isProfileOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-[color:var(--pragmata-surface)] rounded-pragmata shadow-lg border border-[color:var(--pragmata-border)] py-1 origin-top-right animate-in fade-in zoom-in-95 duration-200">
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
            )}
        </div>
      </div>
    </header>
  );
}
