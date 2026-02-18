import { useState } from 'react';
import { Outlet, NavLink, useParams, Link } from 'react-router-dom';
import { Menu, X, ArrowLeft, Building2, ChevronDown } from 'lucide-react';
import { PROJECT_ROUTES } from '@/app/routes.config';
import { usePermission } from '@/features/auth/hooks/usePermission';

export function ProjectLayout() {
  const { projectId } = useParams<{ projectId: string }>();
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    costos: true,
  });
  const { hasPermission } = usePermission();

  const sidebarRoutes = PROJECT_ROUTES.filter(
    (route) => route.layout === 'project' && !route.hideInMenu
  );

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="flex h-screen w-full bg-[color:var(--pragmata-bg)]">
      
      {/* --- Mobile Sidebar Overlay --- */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-[color:var(--pragmata-primary)]/30 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* --- Sidebar (Dark Theme for Project Context) --- */}
      <aside 
        className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-[color:var(--pragmata-primary)] text-white transform transition-transform duration-200 ease-in-out
          md:relative md:translate-x-0
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Project Header / Back to Dashboard */}
          <div className="h-16 flex items-center px-4 border-b border-white/10">
            <Link 
              to="/dashboard" 
              className="mr-3 p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
              title="Volver al inicio"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center min-w-0">
               <Building2 className="w-6 h-6 text-[color:var(--pragmata-accent)] mr-2 flex-shrink-0" />
               <div className="truncate">
                 <p className="text-xs text-white/60 uppercase font-bold">Proyecto</p>
                 <p className="text-sm font-medium truncate">{projectId}</p>
               </div>
            </div>
          </div>

          {/* Navigation Items */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
            {sidebarRoutes.map((route) => {
              if (route.resourceCode && !hasPermission(route.resourceCode)) {
                return null;
              }

              const Icon = route.icon;
              const hasChildren = route.children && route.children.length > 0;
              const groupKey = route.path;
              const isExpanded = expandedGroups[groupKey] ?? false;

              if (hasChildren) {
                return (
                  <div key={route.path} className="space-y-1">
                    <button
                      type="button"
                      onClick={() => toggleGroup(groupKey)}
                      className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-md transition-colors text-white/70 hover:bg-white/10 hover:text-white"
                    >
                      <span className="flex items-center">
                        {Icon && <Icon className="w-5 h-5 mr-3" />}
                        {route.name}
                      </span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>

                    {isExpanded && (
                      <div className="ml-8 space-y-1">
                        {route.children?.map(child => {
                          if (child.resourceCode && !hasPermission(child.resourceCode)) {
                            return null;
                          }

                          const ChildIcon = child.icon;
                          return (
                            <NavLink
                              key={`${route.path}/${child.path}`}
                              to={`${route.path}/${child.path}`}
                              onClick={() => setSidebarOpen(false)}
                              className={({ isActive }) => `
                                flex items-center px-3 py-2 text-sm rounded-md transition-colors
                                ${isActive
                                  ? 'bg-white/10 text-[color:var(--pragmata-accent)]'
                                  : 'text-white/60 hover:bg-white/10 hover:text-white'}
                              `}
                            >
                              {ChildIcon && <ChildIcon className="w-4 h-4 mr-2" />}
                              {child.name}
                            </NavLink>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              // Nota: Como estamos dentro de /projects/:projectId, 
              // los paths relativos (sin / al inicio) funcionan, O concatenamos manualmente.
              // Para seguridad, usamos path relativo directo.
              return (
                <NavLink
                  key={route.path}
                  to={route.path}
                  end={route.path === ''} // Exact match si es la ruta base del proyecto
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) => `
                    flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors
                    ${isActive 
                      ? 'bg-white/10 text-[color:var(--pragmata-accent)]' 
                      : 'text-white/60 hover:bg-white/10 hover:text-white'}
                  `}
                >
                  {Icon && <Icon className="w-5 h-5 mr-3" />}
                  {route.name}
                </NavLink>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* --- Main Content --- */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b flex items-center px-4 md:px-8 justify-between shadow-sm z-10">
          <button 
            className="md:hidden text-slate-500 hover:text-slate-700"
            onClick={() => setSidebarOpen(!isSidebarOpen)}
          >
            {isSidebarOpen ? <X /> : <Menu />}
          </button>
          
          <div className="font-medium text-slate-900">
             Contexto de Proyecto
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
           <Outlet />
        </main>
      </div>
    </div>
  );
}
