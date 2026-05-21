import { forwardRef, useState } from 'react';
import { NavLink, useLocation, useMatch, useNavigate } from 'react-router-dom';
import { ChevronDown, Settings, Layers, ShoppingCart, Globe } from 'lucide-react';
import { BrandIcon } from '@/components/brand/BrandIcon';
import { getPublicBrandName, PRAGMATA_DEVS_ICON_URL, PRAGMATA_DEVS_SITE_URL } from '@/lib/brandEnv';
import { APP_ROUTES, WORKSPACE_ROUTES } from '@/app/routes.config';
import { usePermission } from '@/features/auth/hooks/usePermission';
import { useActiveEntity } from '@/features/entities/hooks/useActiveEntity';
import type { AppRoute } from '@/app/navigation';
import type { ComponentType } from 'react';

/**
 * Metadata for sidebar groups (expandable menus).
 * The key must match the `group` property in AppRoute.
 */
const SIDEBAR_GROUPS: Record<string, { label: string; icon: ComponentType<{ className?: string }> }> = {
  settings: { label: 'Configuración', icon: Settings },
  ecommerce: { label: 'Ecommerce', icon: ShoppingCart },
  seo: { label: 'SEO', icon: Globe },
};

interface SidebarProps {
  isOpen: boolean;
  isCollapsed: boolean;
  onClose: () => void;
  onToggleCollapse: () => void;
}

export const Sidebar = forwardRef<HTMLElement, SidebarProps>(function Sidebar(
  { isOpen, isCollapsed, onClose, onToggleCollapse },
  ref,
) {
  const { hasPermission } = usePermission();
  const location = useLocation();
  const navigate = useNavigate();
  const workspaceMatch = useMatch('/workspace/:entityId/*');
  const isInWorkspace = !!workspaceMatch;

  // Resolved entity: URL > localStorage > first entity alphabetically
  const activeEntityId = useActiveEntity();

  const [isWorkspaceExpanded, setWorkspaceExpanded] = useState(() =>
    location.pathname.startsWith('/workspace')
  );

  // All visible app routes
  const sidebarRoutes = APP_ROUTES.filter(
    (route) => route.layout === 'app' && !route.hideInMenu
  );

  // Separate: ungrouped routes vs grouped routes
  const ungroupedRoutes = sidebarRoutes.filter((r) => !r.group);
  const groupedRoutes = sidebarRoutes.filter((r) => r.group);

  // Build groups: { settings: [route, route, ...] }
  const groups: Record<string, AppRoute[]> = {};
  for (const route of groupedRoutes) {
    const key = route.group!;
    if (!groups[key]) groups[key] = [];
    groups[key].push(route);
  }

  // Auto-expand groups that contain the active route
  const getInitialExpanded = () => {
    const expanded: Record<string, boolean> = {};
    for (const [key, routes] of Object.entries(groups)) {
      expanded[key] = routes.some((r) => location.pathname.startsWith(r.path));
    }
    return expanded;
  };

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(getInitialExpanded);

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Check if any route in a group is currently active
  const isGroupActive = (routes: AppRoute[]) =>
    routes.some((r) => location.pathname.startsWith(r.path));

  /** Renders a single nav link */
  const renderNavLink = (route: AppRoute, indented = false) => {
    if (route.resourceCode && !hasPermission(route.resourceCode)) return null;

    const Icon = route.icon;
    return (
      <NavLink
        key={route.path}
        to={route.path}
        onClick={onClose}
        className={({ isActive }) => `
          flex items-center text-sm font-medium rounded-pragmata transition-all duration-200
          ${isCollapsed ? 'justify-center px-2 py-3' : `${indented ? 'pl-10 pr-3' : 'px-3'} py-2.5`}
          ${isActive
            ? 'bg-[color:var(--pragmata-accent-soft)] text-[color:var(--pragmata-accent)] shadow-sm ring-1 ring-[color:var(--pragmata-border)]'
            : 'text-[color:var(--pragmata-muted)] hover:bg-[color:var(--pragmata-surface-2)] hover:text-[color:var(--pragmata-fg)]'}
        `}
      >
        {({ isActive }) => (
          <>
            {Icon && (
              <div className={`relative ${isCollapsed ? '' : 'mr-3'}`}>
                <Icon className={`w-5 h-5 ${isActive ? 'text-[color:var(--pragmata-accent)]' : 'text-[color:var(--pragmata-muted)]'}`} />
              </div>
            )}
            {!isCollapsed && <span className="truncate">{route.name}</span>}
            {isCollapsed && <span className="sr-only">{route.name}</span>}
          </>
        )}
      </NavLink>
    );
  };

  /** Renders an expandable group */
  const renderGroup = (key: string, routes: AppRoute[]) => {
    const meta = SIDEBAR_GROUPS[key];
    if (!meta) return null;

    // If no routes are visible (all denied by permission), hide the group
    const visibleRoutes = routes.filter(
      (r) => !r.resourceCode || hasPermission(r.resourceCode)
    );
    if (visibleRoutes.length === 0) return null;

    const isExpanded = expandedGroups[key] ?? false;
    const isActive = isGroupActive(routes);
    const GroupIcon = meta.icon;

    // Collapsed sidebar: just show the group icon
    if (isCollapsed) {
      return (
        <button
          key={key}
          type="button"
          onClick={() => {
            // Expand sidebar and reveal this group
            onToggleCollapse();
            setExpandedGroups((prev) => ({ ...prev, [key]: true }));
          }}
          className="w-full flex justify-center px-2 py-3 rounded-pragmata hover:bg-[color:var(--pragmata-surface-2)] transition-colors"
          title={meta.label}
        >
          <GroupIcon className={`w-5 h-5 ${isActive ? 'text-[color:var(--pragmata-accent)]' : 'text-[color:var(--pragmata-muted)]'}`} />
        </button>
      );
    }

    return (
      <div key={key}>
        {/* Group header (clickable) */}
        <button
          onClick={() => toggleGroup(key)}
          className={`
            w-full flex items-center text-sm font-medium rounded-pragmata transition-all duration-200 px-3 py-2.5
            ${isActive
              ? 'text-[color:var(--pragmata-accent)]'
              : 'text-[color:var(--pragmata-muted)] hover:bg-[color:var(--pragmata-surface-2)] hover:text-[color:var(--pragmata-fg)]'}
          `}
        >
          <div className="mr-3">
            <GroupIcon className={`w-5 h-5 ${isActive ? 'text-[color:var(--pragmata-accent)]' : 'text-[color:var(--pragmata-muted)]'}`} />
          </div>
          <span className="truncate flex-1 text-left">{meta.label}</span>
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`}
          />
        </button>

        {/* Children (animated) */}
        <div
          className={`overflow-hidden transition-all duration-200 ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}`}
        >
          <div className="mt-1 space-y-1">
            {visibleRoutes.map((route) => renderNavLink(route, true))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <aside
        ref={ref}
        className={`
          fixed inset-y-0 left-0 z-sidebar md:z-auto bg-[color:var(--pragmata-surface)] border-r border-[color:var(--pragmata-border)] transform transition-all duration-300 cubic-bezier(0.4, 0, 0.2, 1)
          md:relative md:translate-x-0 flex flex-col
          ${isCollapsed ? 'w-20' : 'w-64'}
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Brand */}
        <button
          type="button"
          onClick={onToggleCollapse}
          className={`h-16 flex items-center gap-3 border-b border-[color:var(--pragmata-border)] transition-all hover:bg-[color:var(--pragmata-surface-2)] ${isCollapsed ? 'px-4 justify-center' : 'px-6'}`}
          title="Ocultar/Mostrar Sidebar"
        >
          <BrandIcon className="h-8 w-8 rounded-pragmata flex-shrink-0" />
          {!isCollapsed && (
            <span className="font-bold text-lg tracking-tight text-[color:var(--pragmata-fg)]">
              {getPublicBrandName()}
            </span>
          )}
        </button>

        {/* Navigation */}
        <nav className={`flex-1 overflow-y-auto space-y-1 ${isCollapsed ? 'p-2' : 'p-4'}`}>
          {/* Ungrouped routes (Dashboard, Mi Perfil) */}
          {ungroupedRoutes.map((route) => renderNavLink(route))}

          {/* Separator */}
          {!isCollapsed && (
            <div className="py-2">
              <div className="h-px bg-[color:var(--pragmata-border)] mx-3" />
            </div>
          )}

          {/* ─── CONFIGURACIÓN (grouped routes — above Workspace) ─── */}
          {groups.settings ? renderGroup('settings', groups.settings) : null}

          {/* Separator */}
          {!isCollapsed && (
            <div className="py-2">
              <div className="h-px bg-[color:var(--pragmata-border)] mx-3" />
            </div>
          )}

          {/* ─── WORKSPACE section ─────────────────────────── */}
          <div>
            <button
              onClick={() => {
                if (!isInWorkspace && activeEntityId) {
                  navigate(`/workspace/${activeEntityId}/dashboard`);
                  setWorkspaceExpanded(true);
                } else {
                  setWorkspaceExpanded(p => !p);
                }
              }}
              className={`
                w-full flex items-center text-sm font-medium rounded-pragmata transition-all duration-200
                ${isCollapsed ? 'justify-center px-2 py-3' : 'px-3 py-2.5'}
                ${isInWorkspace
                  ? 'text-[color:var(--pragmata-accent)]'
                  : 'text-[color:var(--pragmata-muted)] hover:bg-[color:var(--pragmata-surface-2)] hover:text-[color:var(--pragmata-fg)]'}
              `}
              title={isCollapsed ? 'Workspace' : undefined}
            >
              <div className={isCollapsed ? '' : 'mr-3'}>
                <Layers className={`w-5 h-5 ${isInWorkspace ? 'text-[color:var(--pragmata-accent)]' : 'text-[color:var(--pragmata-muted)]'}`} />
              </div>
              {!isCollapsed && (
                <>
                  <span className="truncate flex-1 text-left">Workspace</span>
                  <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isWorkspaceExpanded ? '' : '-rotate-90'}`} />
                </>
              )}
            </button>

            {!isCollapsed && (
              <div className={`overflow-hidden transition-all duration-200 ${isWorkspaceExpanded ? 'max-h-screen opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="mt-1 space-y-1">
                  {WORKSPACE_ROUTES
                    .filter(r => !r.hideInMenu && (!r.resourceCode || hasPermission(r.resourceCode)))
                    .map(route => {
                      const Icon = route.icon;
                      // Always render a real link — if entity is resolved use it,
                      // if not the WorkspacePage itself will handle the empty state.
                      const to = activeEntityId
                        ? `/workspace/${activeEntityId}/${route.path}`
                        : `/workspace/none/${route.path}`;
                      return (
                        <NavLink
                          key={route.path}
                          to={to}
                          onClick={onClose}
                          className={({ isActive }) => `
                            flex items-center text-sm font-medium rounded-pragmata transition-all duration-200 pl-8 pr-3 py-2
                            ${isActive
                              ? 'bg-[color:var(--pragmata-accent-soft)] text-[color:var(--pragmata-accent)] shadow-sm ring-1 ring-[color:var(--pragmata-border)]'
                              : 'text-[color:var(--pragmata-muted)] hover:bg-[color:var(--pragmata-surface-2)] hover:text-[color:var(--pragmata-fg)]'}
                          `}
                        >
                          {Icon && <Icon className="w-4 h-4 mr-2.5 flex-shrink-0" />}
                          <span className="truncate">{route.name}</span>
                        </NavLink>
                      );
                    })}
                </div>
              </div>
            )}
          </div>

          {/* Separator antes de Ecommerce / SEO */}
          {!isCollapsed && (groups.ecommerce || groups.seo) && (
            <div className="py-2">
              <div className="h-px bg-[color:var(--pragmata-border)] mx-3" />
            </div>
          )}

          {/* ─── ECOMMERCE section (feature-flagged routes) ─── */}
          {groups.ecommerce ? renderGroup('ecommerce', groups.ecommerce) : null}

          {!isCollapsed && groups.seo && groups.ecommerce && (
            <div className="py-2">
              <div className="h-px bg-[color:var(--pragmata-border)] mx-3" />
            </div>
          )}

          {/* ─── SEO / CMS sitio público ─── */}
          {groups.seo ? renderGroup('seo', groups.seo) : null}
        </nav>

        {/* Bottom Area */}
        <div
          className={`text-xs text-center text-[color:var(--pragmata-muted)] border-t border-[color:var(--pragmata-border)] ${isCollapsed ? 'p-2' : 'p-4'}`}
        >
          <a
            href={PRAGMATA_DEVS_SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-fg)] transition-colors ${isCollapsed ? 'justify-center' : 'gap-2'}`}
            title="PragmataDevs"
          >
            <img
              src={PRAGMATA_DEVS_ICON_URL}
              alt="PragmataDevs"
              width={24}
              height={24}
              className="h-6 w-6 rounded-pragmata flex-shrink-0"
              decoding="async"
            />
            {!isCollapsed && (
              <span className="leading-relaxed text-left">
                &copy; {new Date().getFullYear()} {getPublicBrandName()}
                <span className="block font-medium text-[color:var(--pragmata-accent)]">PragmataDevs</span>
              </span>
            )}
          </a>
        </div>
      </aside>
    </>
  );
});
