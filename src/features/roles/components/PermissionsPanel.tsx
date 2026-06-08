import { useState, useMemo } from 'react';
import { Check, ChevronDown, ChevronRight, Layout, Zap, Component } from 'lucide-react';
import { APP_RESOURCES, type ResourceDefinition } from '@/config/security/resources';
import type { ResourceAction } from '@/features/auth/types/rbac';

/**
 * GrantedPermissions: Maps resource codes to their granted actions.
 * Aligns directly with sys_role_definitions in the database.
 * Example: { 'page_projects_list': ['read', 'create'], 'action_project_archive': ['execute'] }
 */
export type GrantedPermissions = Record<string, ResourceAction[]>;

/** Icon mapping by resource type */
const TYPE_ICONS: Record<string, typeof Layout> = {
  page: Layout,
  widget: Component,
  action: Zap,
};

const TYPE_LABELS: Record<string, string> = {
  page: 'Página',
  widget: 'Widget',
  action: 'Acción',
  data: 'Dato',
};

/** Human-readable labels for actions */
const ACTION_LABELS: Record<string, string> = {
  read: 'Leer',
  create: 'Crear',
  update: 'Editar',
  delete: 'Eliminar',
  approve: 'Aprobar',
  export: 'Exportar',
  execute: 'Ejecutar',
  invite: 'Invitar',
  broadcast: 'Difundir',
};

interface PermissionGroup {
  category: string;
  resources: ResourceDefinition[];
}

interface PermissionsPanelProps {
  selectedPermissions: GrantedPermissions;
  onChange: (permissions: GrantedPermissions) => void;
}

export default function PermissionsPanel({ selectedPermissions, onChange }: PermissionsPanelProps) {
  // Group resources by category dynamically
  const groups = useMemo<PermissionGroup[]>(() => {
    const map = new Map<string, ResourceDefinition[]>();
    for (const resource of APP_RESOURCES) {
      const cat = resource.category;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(resource);
    }
    return Array.from(map.entries()).map(([category, resources]) => ({
      category,
      resources,
    }));
  }, []);

  const [expandedGroups, setExpandedGroups] = useState<string[]>(
    groups.map((g) => g.category)
  );

  const toggleGroup = (category: string) => {
    setExpandedGroups((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  };

  // Toggle a single action for a resource
  const toggleAction = (code: string, action: ResourceAction) => {
    const current = selectedPermissions[code] ?? [];
    const hasAction = current.includes(action);
    let newActions: ResourceAction[];

    if (hasAction) {
      newActions = current.filter((a) => a !== action);
    } else {
      newActions = [...current, action];
    }

    const next = { ...selectedPermissions };
    if (newActions.length === 0) {
      delete next[code];
    } else {
      next[code] = newActions;
    }
    onChange(next);
  };

  // Toggle ALL actions for a resource at once
  const toggleAllActions = (resource: ResourceDefinition) => {
    const current = selectedPermissions[resource.code] ?? [];
    const allSelected = resource.default_actions.every((a) => current.includes(a));
    const next = { ...selectedPermissions };

    if (allSelected) {
      delete next[resource.code];
    } else {
      next[resource.code] = [...resource.default_actions];
    }
    onChange(next);
  };

  // Toggle ALL resources (with all their actions) in a group
  const toggleAllInGroup = (group: PermissionGroup) => {
    const allFullySelected = group.resources.every((r) => {
      const current = selectedPermissions[r.code] ?? [];
      return r.default_actions.every((a) => current.includes(a));
    });

    const next = { ...selectedPermissions };
    if (allFullySelected) {
      group.resources.forEach((r) => delete next[r.code]);
    } else {
      group.resources.forEach((r) => {
        next[r.code] = [...r.default_actions];
      });
    }
    onChange(next);
  };

  // Helpers
  const isResourceFullySelected = (resource: ResourceDefinition) => {
    const current = selectedPermissions[resource.code] ?? [];
    return resource.default_actions.every((a) => current.includes(a));
  };

  const isResourcePartiallySelected = (resource: ResourceDefinition) => {
    const current = selectedPermissions[resource.code] ?? [];
    return current.length > 0 && !resource.default_actions.every((a) => current.includes(a));
  };

  const isGroupFullySelected = (group: PermissionGroup) =>
    group.resources.every((r) => isResourceFullySelected(r));

  const isGroupPartiallySelected = (group: PermissionGroup) => {
    const anySelected = group.resources.some((r) => (selectedPermissions[r.code] ?? []).length > 0);
    return anySelected && !isGroupFullySelected(group);
  };

  const countGroupSelected = (group: PermissionGroup) =>
    group.resources.filter((r) => (selectedPermissions[r.code] ?? []).length > 0).length;

  return (
    <div className="border border-[color:var(--pragmata-border)] rounded-lg overflow-hidden bg-[color:var(--pragmata-surface)]">
      {groups.map((group) => {
        const isExpanded = expandedGroups.includes(group.category);
        const isFullySelected = isGroupFullySelected(group);
        const isPartiallySelected = isGroupPartiallySelected(group);

        return (
          <div key={group.category} className="border-b border-[color:var(--pragmata-border)] last:border-b-0">
            {/* Group Header */}
            <div className="bg-[color:var(--pragmata-surface-2)] px-4 py-3 flex items-center justify-between hover:bg-[color:var(--pragmata-accent-soft)] transition-colors">
              <button
                type="button"
                onClick={() => toggleGroup(group.category)}
                className="flex items-center gap-2 flex-1"
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 text-[color:var(--pragmata-muted)]" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-[color:var(--pragmata-muted)]" />
                )}
                <span className="font-medium text-[color:var(--pragmata-fg)]">{group.category}</span>
                <span className="text-xs text-[color:var(--pragmata-muted)] tabular-nums">
                  {countGroupSelected(group)}/{group.resources.length}
                </span>
              </button>

              {/* Select All in Group */}
              <button
                type="button"
                onClick={() => toggleAllInGroup(group)}
                className={`
                  w-5 h-5 rounded border-2 flex items-center justify-center transition-colors
                  ${
                    isFullySelected
                      ? 'bg-[color:var(--pragmata-accent)] border-[color:var(--pragmata-accent)]'
                      : isPartiallySelected
                      ? 'bg-[color:var(--pragmata-accent-soft)] border-[color:var(--pragmata-accent)]'
                      : 'border-[color:var(--pragmata-border-strong)] hover:border-[color:var(--pragmata-accent)] bg-white'
                  }
                `}
              >
                {isFullySelected && <Check className="h-3 w-3 text-white" />}
                {isPartiallySelected && !isFullySelected && (
                  <div className="w-2 h-0.5 bg-[color:var(--pragmata-accent)]" />
                )}
              </button>
            </div>

            {/* Resources List */}
            {isExpanded && (
              <div className="bg-[color:var(--pragmata-surface)]">
                {group.resources.map((resource) => {
                  const isFull = isResourceFullySelected(resource);
                  const isPartial = isResourcePartiallySelected(resource);
                  const TypeIcon = TYPE_ICONS[resource.type] ?? Zap;

                  return (
                    <div
                      key={resource.code}
                      className="px-4 py-3 hover:bg-[color:var(--pragmata-row-hover)] transition-colors border-t border-[color:var(--pragmata-border)] first:border-t-0"
                    >
                      <div className="flex items-start gap-3">
                        {/* Resource-level checkbox (toggles ALL actions) */}
                        <button
                          type="button"
                          onClick={() => toggleAllActions(resource)}
                          className={`
                            mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0
                            ${
                              isFull
                                ? 'bg-[color:var(--pragmata-accent)] border-[color:var(--pragmata-accent)]'
                                : isPartial
                                ? 'bg-[color:var(--pragmata-accent-soft)] border-[color:var(--pragmata-accent)]'
                                : 'border-[color:var(--pragmata-border-strong)] hover:border-[color:var(--pragmata-accent)] bg-white'
                            }
                          `}
                        >
                          {isFull && <Check className="h-3 w-3 text-white" />}
                          {isPartial && !isFull && (
                            <div className="w-2 h-0.5 bg-[color:var(--pragmata-accent)]" />
                          )}
                        </button>

                        <div className="flex-1 min-w-0">
                          {/* Resource name + type badge */}
                          <div className="flex items-center gap-2 mb-0.5">
                            <button
                              type="button"
                              onClick={() => toggleAllActions(resource)}
                              className="text-sm font-medium text-[color:var(--pragmata-fg)] text-left"
                            >
                              {resource.name}
                            </button>
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-[color:var(--pragmata-surface-2)] text-[color:var(--pragmata-muted)] border border-[color:var(--pragmata-border)]">
                              <TypeIcon className="w-2.5 h-2.5" />
                              {TYPE_LABELS[resource.type] ?? resource.type}
                            </span>
                          </div>

                          {resource.description && (
                            <p className="text-xs text-[color:var(--pragmata-muted)] mb-2">
                              {resource.description}
                            </p>
                          )}

                          {/* Action checkboxes */}
                          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-1">
                            {resource.default_actions.map((action) => {
                              const isChecked = (selectedPermissions[resource.code] ?? []).includes(action);
                              return (
                                <button
                                  key={action}
                                  type="button"
                                  onClick={() => toggleAction(resource.code, action)}
                                  className="flex items-center gap-1.5 group/action"
                                >
                                  <div
                                    className={`
                                      w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center transition-colors
                                      ${
                                        isChecked
                                          ? 'bg-[color:var(--pragmata-accent)] border-[color:var(--pragmata-accent)]'
                                          : 'border-[color:var(--pragmata-border-strong)] group-hover/action:border-[color:var(--pragmata-accent)] bg-white'
                                      }
                                    `}
                                  >
                                    {isChecked && <Check className="h-2.5 w-2.5 text-white" />}
                                  </div>
                                  <span className={`text-xs transition-colors ${
                                    isChecked 
                                      ? 'text-[color:var(--pragmata-fg)] font-medium' 
                                      : 'text-[color:var(--pragmata-muted)] group-hover/action:text-[color:var(--pragmata-fg)]'
                                  }`}>
                                    {ACTION_LABELS[action] ?? action}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
