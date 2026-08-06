import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ScrollNav } from '@/components/ui/ScrollNav';

export function AppLayout() {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();

  // Cerrar el sidebar móvil al navegar. Se ajusta DURANTE el render comparando
  // con la ruta anterior, en vez de en un useEffect: un setState síncrono dentro
  // de un efecto obliga a React a pintar el estado viejo y volver a renderizar
  // (render en cascada). Con este patrón —el que documenta React para "ajustar
  // estado cuando cambia una prop"— React descarta el render en curso y rehace
  // con el valor nuevo, sin llegar a pintar el intermedio.
  const [lastPath, setLastPath] = useState(location.pathname);
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname);
    setSidebarOpen(false);
  }

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (sidebarRef.current?.contains(target)) return;
      if (target.closest('[data-mobile-menu-trigger]')) return;
      if (target.closest('[data-floating-menu]')) return;
      if (target.closest('[data-overlay-sheet]')) return;

      const isDesktop = window.matchMedia('(min-width: 768px)').matches;

      if (isDesktop) {
        if (!isSidebarCollapsed) {
          setSidebarCollapsed(true);
        }
        return;
      }

      if (isSidebarOpen) {
        setSidebarOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [isSidebarCollapsed, isSidebarOpen]);

  const closeSidebar = () => setSidebarOpen(false);
  const toggleSidebar = () => setSidebarOpen((open) => !open);

  return (
    <div className="flex h-screen w-full bg-[color:var(--pragmata-bg)] overflow-hidden">
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-sidebar-backdrop bg-[color:var(--pragmata-primary)]/30 backdrop-blur-sm md:hidden"
          aria-hidden
          onPointerDown={closeSidebar}
        />
      )}

      <Sidebar
        ref={sidebarRef}
        isOpen={isSidebarOpen}
        isCollapsed={isSidebarCollapsed}
        onClose={closeSidebar}
        onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
      />

      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        <Header onMenuClick={toggleSidebar} />

        <main ref={mainRef} className="flex-1 overflow-auto bg-[color:var(--pragmata-bg)] scroll-smooth">
          <Outlet />
        </main>

        {/* Flechitas para irse hasta arriba/abajo del contenido (Wicho 2026-07-30) */}
        <ScrollNav targetRef={mainRef} />
      </div>
    </div>
  );
}
