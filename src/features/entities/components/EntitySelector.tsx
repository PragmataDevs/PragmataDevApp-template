import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronsUpDown, Layers, Check, Search, Plus, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ENTITY_STATUS_CONFIG, ENTITY_LABEL, ENTITY_LABEL_PLURAL } from '@/types/entities/entity';

const STORAGE_KEY = 'pragmata_last_entity_id';
const POWERSYNC_ENABLED = import.meta.env.VITE_ENABLE_POWERSYNC === 'true';

interface EntityOption {
  id:            string;
  name:          string;
  code:          string | null;
  entity_status: string;
}

export default function EntitySelector() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const params = useParams<{ entityId?: string }>();
  const [isOpen, setIsOpen] = useState(false);
  const [entities, setEntities] = useState<EntityOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Load entities ──────────────────────────────────────

  const fetchEntities = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      if (POWERSYNC_ENABLED) {
        const { db } = await import('@/lib/db');
        const rows = await db.getAll<EntityOption>(
          `SELECT id, name, code, entity_status FROM entities WHERE status = 'active' ORDER BY name ASC`,
        );
        setEntities(rows || []);
      } else {
        const { data, error } = await supabase
          .from('entities')
          .select('id, name, code, entity_status')
          .eq('status', 'active')
          .order('name');

        if (error) throw error;
        setEntities(data || []);
      }
    } catch (err: any) {
      console.error('Error loading entities:', err.message);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    fetchEntities();
  }, [fetchEntities]);

  // ── Sync selected from URL or localStorage ────────────

  useEffect(() => {
    if (params.entityId) {
      setSelectedId(params.entityId);
      localStorage.setItem(STORAGE_KEY, params.entityId);
    } else {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && entities.some((e) => e.id === stored)) {
        setSelectedId(stored);
      } else if (entities.length > 0) {
        setSelectedId(entities[0].id);
      }
    }
  }, [params.entityId, entities]);

  // ── Close on outside click ─────────────────────────────

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchRef.current) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // ── Handlers ───────────────────────────────────────────

  const handleSelect = (entity: EntityOption) => {
    setSelectedId(entity.id);
    localStorage.setItem(STORAGE_KEY, entity.id);
    setIsOpen(false);
    setSearchTerm('');
    navigate(`/workspace/${entity.id}/dashboard`);
  };

  // ── Derived ────────────────────────────────────────────

  const selected = entities.find((e) => e.id === selectedId);
  const filtered = entities.filter(
    (e) =>
      e.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 py-1.5 px-3 rounded-lg border border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface-2)] hover:bg-[color:var(--pragmata-surface)] hover:border-[color:var(--pragmata-border-strong)] transition-all text-sm font-medium text-[color:var(--pragmata-fg)] min-w-[200px] justify-between group"
      >
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-5 h-5 rounded-md bg-[color:var(--pragmata-accent)] flex items-center justify-center text-[10px] text-white font-bold flex-shrink-0">
            {selected?.name?.charAt(0).toUpperCase() || 'E'}
          </div>
          <span className="truncate">
            {loading ? 'Cargando...' : selected?.name || `Seleccionar ${ENTITY_LABEL}`}
          </span>
        </div>
        <ChevronsUpDown className="w-4 h-4 text-[color:var(--pragmata-muted-2)] group-hover:text-[color:var(--pragmata-fg)] flex-shrink-0" />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-72 bg-[color:var(--pragmata-surface)] rounded-xl shadow-xl border border-[color:var(--pragmata-border)] z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          <div className="p-2 border-b border-[color:var(--pragmata-border)]">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[color:var(--pragmata-muted)]" />
              <input
                ref={searchRef}
                type="text"
                placeholder={`Buscar ${ENTITY_LABEL.toLowerCase()}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-[color:var(--pragmata-surface-2)] border border-[color:var(--pragmata-border)] rounded-lg text-xs text-[color:var(--pragmata-fg)] placeholder:text-[color:var(--pragmata-muted)] focus:outline-none focus:ring-1 focus:ring-[color:var(--pragmata-accent)]"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-[color:var(--pragmata-accent)]" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-6 text-xs text-[color:var(--pragmata-muted)]">
                {searchTerm ? 'Sin resultados' : `Sin ${ENTITY_LABEL_PLURAL.toLowerCase()}`}
              </div>
            ) : (
              filtered.map((entity) => {
                const isSelected = entity.id === selectedId;
                const statusCfg = ENTITY_STATUS_CONFIG[entity.entity_status as keyof typeof ENTITY_STATUS_CONFIG];
                return (
                  <button
                    key={entity.id}
                    onClick={() => handleSelect(entity)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-[color:var(--pragmata-surface-2)] transition-colors ${
                      isSelected ? 'bg-[color:var(--pragmata-accent-soft)]' : ''
                    }`}
                  >
                    <div className="w-7 h-7 rounded-md bg-[color:var(--pragmata-surface-2)] border border-[color:var(--pragmata-border)] flex items-center justify-center flex-shrink-0">
                      <Layers className="h-3.5 w-3.5 text-[color:var(--pragmata-accent)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[color:var(--pragmata-fg)] truncate">{entity.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {entity.code && (
                          <span className="text-[10px] text-[color:var(--pragmata-muted)] font-mono">{entity.code}</span>
                        )}
                        {statusCfg && (
                          <span className={`text-[10px] font-medium ${statusCfg.color}`}>{statusCfg.label}</span>
                        )}
                      </div>
                    </div>
                    {isSelected && <Check className="h-4 w-4 text-[color:var(--pragmata-accent)] flex-shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          <div className="border-t border-[color:var(--pragmata-border)] p-1">
            <button
              onClick={() => { setIsOpen(false); navigate('/settings/entities'); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-fg)] hover:bg-[color:var(--pragmata-surface-2)] rounded-lg transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Gestionar {ENTITY_LABEL_PLURAL.toLowerCase()}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
