import {
  useState,
  useMemo,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  EyeOff,
  Eye,
  Download,
  Loader2,
  Search,
  X,
  Filter,
  ArrowUpDown,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ColumnDef<T> {
  /** Unique key — matches the property on T, or a dot-path for nested values */
  key: string;
  /** Column header label */
  header: string;
  /** Custom cell renderer. Receives the raw cell value and the full row. */
  render?: (value: unknown, row: T) => ReactNode;
  /** Enables sort via header menu (default: true) */
  sortable?: boolean;
  /** Enables filter via header menu (default: true) */
  filterable?: boolean;
  /**
   * Explicit pixel width. Required for columns beyond the first when using
   * stickyColumns > 1, so offsets can be calculated correctly.
   * @default 160
   */
  width?: number;
  /** Override the header label shown on mobile cards */
  mobileLabel?: string;
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  /** Unique row identifier (e.g. "id") */
  rowKey: keyof T & string;
  loading?: boolean;
  /**
   * How many DATA columns (after the actions column) should remain sticky
   * on horizontal scroll. Each sticky column needs a defined `width`.
   * @default 0
   */
  stickyColumns?: number;
  /** Renders the fixed-left actions cell for each row. */
  actions?: (row: T) => ReactNode;
  /**
   * Called with the current filtered dataset when the user clicks Export.
   * If omitted, a built-in CSV download is triggered.
   */
  onExport?: (filtered: T[]) => void;
  emptyMessage?: string;
  emptyDescription?: string;
  className?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ACTIONS_WIDTH = 64;   // px — matches w-16
const DEFAULT_WIDTH = 160;  // px — fallback when column.width is undefined
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Resolves a potentially nested key like "entity.name" from a row object. */
function resolveValue(row: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((acc, part) => {
    if (acc !== null && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, row);
}

/** Returns the inline style for a sticky data column based on index. */
function stickyStyle(
  colIndex: number,       // 0-based index in visibleColumns
  visibleCols: ColumnDef<unknown>[],
  stickyCount: number,
): React.CSSProperties | undefined {
  if (colIndex >= stickyCount) return undefined;
  let left = ACTIONS_WIDTH;
  for (let i = 0; i < colIndex; i++) {
    left += visibleCols[i].width ?? DEFAULT_WIDTH;
  }
  return { position: 'sticky', left, zIndex: 1 };
}

/** Export data as a CSV file. */
function exportCSV<T>(columns: ColumnDef<T>[], rows: T[], filename = 'export') {
  const header = columns.map(c => `"${c.header}"`).join(',');
  const body = rows.map(row =>
    columns.map(c => {
      const val = resolveValue(row, c.key);
      if (val === null || val === undefined) return '';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    }).join(',')
  );
  const csv = [header, ...body].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  rowKey,
  loading = false,
  stickyColumns = 0,
  actions,
  onExport,
  emptyMessage = 'Sin resultados',
  emptyDescription = 'No se encontraron registros con los filtros actuales.',
  className = '',
}: DataTableProps<T>) {

  // ── State ──────────────────────────────────────────────────────────────────
  const [sortConfig, setSortConfig] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [globalSearch, setGlobalSearch] = useState('');
  const [hiddenCols, setHiddenCols] = useState<string[]>([]);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; left: number } | null>(null);
  const [filterInputCol, setFilterInputCol] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  const menuRef = useRef<HTMLDivElement>(null);

  // ── Close column menu on outside click ────────────────────────────────────
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null);
        setMenuAnchor(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  // Reset to first page when data/filters change
  useEffect(() => { setPage(0); }, [data, columnFilters, globalSearch, sortConfig]);

  // ── Derived data ───────────────────────────────────────────────────────────
  const visibleColumns = useMemo(
    () => columns.filter(c => !hiddenCols.includes(c.key)),
    [columns, hiddenCols],
  );

  const processedData = useMemo(() => {
    let result = [...data];

    // Global search across all string-like fields
    if (globalSearch.trim()) {
      const q = globalSearch.toLowerCase();
      result = result.filter(row =>
        visibleColumns.some(c => {
          const val = resolveValue(row, c.key);
          return String(val ?? '').toLowerCase().includes(q);
        })
      );
    }

    // Per-column filters
    for (const [key, value] of Object.entries(columnFilters)) {
      if (!value.trim()) continue;
      const q = value.toLowerCase();
      result = result.filter(row =>
        String(resolveValue(row, key) ?? '').toLowerCase().includes(q)
      );
    }

    // Sort
    if (sortConfig) {
      result.sort((a, b) => {
        const av = String(resolveValue(a, sortConfig.key) ?? '');
        const bv = String(resolveValue(b, sortConfig.key) ?? '');
        const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' });
        return sortConfig.dir === 'asc' ? cmp : -cmp;
      });
    }

    return result;
  }, [data, visibleColumns, globalSearch, columnFilters, sortConfig]);

  const totalPages = Math.max(1, Math.ceil(processedData.length / pageSize));
  const paginatedData = processedData.slice(page * pageSize, (page + 1) * pageSize);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSort = useCallback((key: string, dir: 'asc' | 'desc') => {
    setSortConfig({ key, dir });
    setMenuOpen(null);
  }, []);

  const handleColumnFilter = useCallback((key: string, value: string) => {
    setColumnFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleHideColumn = useCallback((key: string) => {
    setHiddenCols(prev => [...prev, key]);
    setMenuOpen(null);
  }, []);

  const handleShowAll = useCallback(() => {
    setHiddenCols([]);
  }, []);

  const handleExport = useCallback(() => {
    if (onExport) { onExport(processedData); return; }
    exportCSV(visibleColumns, processedData);
  }, [onExport, visibleColumns, processedData]);

  const clearFilters = useCallback(() => {
    setColumnFilters({});
    setGlobalSearch('');
    setSortConfig(null);
    setFilterInputCol(null);
  }, []);

  const hasActiveFilters = globalSearch || Object.values(columnFilters).some(v => v.trim());

  // ── Render helpers ─────────────────────────────────────────────────────────

  /** Sort icon for a column header */
  const SortIcon = ({ colKey }: { colKey: string }) => {
    if (sortConfig?.key !== colKey) return <ArrowUpDown className="w-3 h-3 opacity-40" />;
    return sortConfig.dir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-[color:var(--pragmata-accent)]" />
      : <ChevronDown className="w-3 h-3 text-[color:var(--pragmata-accent)]" />;
  };

  /** Column header cell with dropdown menu */
  const renderHeaderCell = (col: ColumnDef<T>, colIndex: number) => {
    const isMenuOpen = menuOpen === col.key;
    const isFiltered = !!columnFilters[col.key]?.trim();
    const isSorted = sortConfig?.key === col.key;
    const sticky = stickyStyle(colIndex, visibleColumns as ColumnDef<unknown>[], stickyColumns);
    const width = col.width ?? DEFAULT_WIDTH;

    return (
      <th
        key={col.key}
        style={{ width, minWidth: width, ...(sticky ?? {}) }}
        className={[
          'relative select-none',
          'bg-[color:var(--pragmata-surface-2)] border-b-2 border-[color:var(--pragmata-border)]',
          'text-xs font-semibold uppercase tracking-wider text-[color:var(--pragmata-muted)]',
          sticky ? 'shadow-[2px_0_4px_rgba(0,0,0,0.06)]' : '',
        ].join(' ')}
      >
        <div className="flex items-center gap-1 px-3 py-3">
          {/* Filter active dot */}
          {isFiltered && (
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--pragmata-accent)] flex-shrink-0" />
          )}

          {/* Filter input (inline) */}
          {filterInputCol === col.key ? (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <input
                autoFocus
                value={columnFilters[col.key] ?? ''}
                onChange={e => handleColumnFilter(col.key, e.target.value)}
                onKeyDown={e => e.key === 'Escape' && setFilterInputCol(null)}
                placeholder={`Filtrar ${col.header.toLowerCase()}...`}
                className="w-full bg-transparent text-xs text-[color:var(--pragmata-fg)] outline-none placeholder:text-[color:var(--pragmata-muted-2)] border-b border-[color:var(--pragmata-accent)]"
              />
              <button
                onClick={() => { handleColumnFilter(col.key, ''); setFilterInputCol(null); }}
                className="text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-danger)] flex-shrink-0"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ) : (
            <span className={[
              'truncate flex-1 cursor-default',
              isSorted ? 'text-[color:var(--pragmata-accent)]' : '',
            ].join(' ')}>
              {col.header}
            </span>
          )}

          {/* Sort icon */}
          {filterInputCol !== col.key && (
            <SortIcon colKey={col.key} />
          )}

          {/* Menu trigger */}
          {filterInputCol !== col.key && (
            <button
              onClick={(e) => {
                if (isMenuOpen) {
                  setMenuOpen(null);
                  setMenuAnchor(null);
                } else {
                  const rect   = e.currentTarget.getBoundingClientRect();
                  const menuW  = 184;
                  const left   = rect.right + menuW > window.innerWidth
                    ? rect.right - menuW
                    : rect.left;
                  setMenuAnchor({ top: rect.bottom + 4, left: Math.max(8, left) });
                  setMenuOpen(col.key);
                }
              }}
              className={[
                'flex-shrink-0 rounded p-0.5 transition-colors',
                isMenuOpen
                  ? 'bg-[color:var(--pragmata-accent-soft)] text-[color:var(--pragmata-accent)]'
                  : 'text-[color:var(--pragmata-muted)] hover:bg-[color:var(--pragmata-border)] hover:text-[color:var(--pragmata-fg)]',
              ].join(' ')}
            >
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isMenuOpen ? 'rotate-180' : ''}`} />
            </button>
          )}
        </div>
      </th>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className={`flex flex-col gap-3 ${className}`}>

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center">
        {/* Global search */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[color:var(--pragmata-muted)]" />
          <input
            value={globalSearch}
            onChange={e => setGlobalSearch(e.target.value)}
            placeholder="Buscar en todos los campos..."
            className="w-full pl-9 pr-9 py-2 text-sm bg-[color:var(--pragmata-surface)] border border-[color:var(--pragmata-border)] rounded-lg text-[color:var(--pragmata-fg)] placeholder:text-[color:var(--pragmata-muted-2)] focus:outline-none focus:ring-2 focus:ring-[color:var(--pragmata-accent)] focus:border-transparent transition"
          />
          {globalSearch && (
            <button
              onClick={() => setGlobalSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--pragmata-muted)] hover:text-[color:var(--pragmata-danger)]"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Clear filters */}
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-[color:var(--pragmata-danger)] border border-[color:var(--pragmata-danger)]/30 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Limpiar
            </button>
          )}

          {/* Show hidden columns */}
          {hiddenCols.length > 0 && (
            <button
              onClick={handleShowAll}
              className="flex items-center gap-1.5 px-3 py-2 text-sm text-[color:var(--pragmata-muted)] border border-[color:var(--pragmata-border)] rounded-lg hover:bg-[color:var(--pragmata-surface-2)] transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              Mostrar ({hiddenCols.length})
            </button>
          )}

          {/* Export */}
          <button
            onClick={handleExport}
            disabled={processedData.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-[color:var(--pragmata-muted)] border border-[color:var(--pragmata-border)] rounded-lg hover:bg-[color:var(--pragmata-surface-2)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />
            Exportar
          </button>
        </div>
      </div>

      {/* ── Table container ──────────────────────────────────────────────── */}
      <div className="rounded-lg border border-[color:var(--pragmata-border)] bg-[color:var(--pragmata-surface)] overflow-hidden">
        {/* ── DESKTOP TABLE (md+) ──────────────────────────────────────── */}
        <div className="hidden md:block overflow-auto max-h-[calc(100vh-20rem)]">
          <table className="w-full border-collapse" style={{ minWidth: 'max-content' }}>
            <thead className="sticky top-0 z-20">
              <tr>
                {/* Actions column header */}
                {actions && (
                  <th
                    style={{ width: ACTIONS_WIDTH, minWidth: ACTIONS_WIDTH, position: 'sticky', left: 0, zIndex: 30 }}
                    className="bg-[color:var(--pragmata-surface-2)] border-b-2 border-[color:var(--pragmata-border)] text-xs font-semibold uppercase tracking-wider text-[color:var(--pragmata-muted)] px-3 py-3 text-center shadow-[2px_0_4px_rgba(0,0,0,0.06)]"
                  >
                    <ChevronsUpDown className="w-3.5 h-3.5 mx-auto opacity-50" />
                  </th>
                )}
                {/* Data column headers */}
                {visibleColumns.map((col, i) => renderHeaderCell(col, i))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-[color:var(--pragmata-surface)]' : 'bg-[color:var(--pragmata-surface-2)]'}>
                    {actions && (
                      <td style={{ position: 'sticky', left: 0, width: ACTIONS_WIDTH }} className="bg-inherit px-3 py-3">
                        <div className="h-4 w-8 rounded animate-pulse bg-[color:var(--pragmata-border)]" />
                      </td>
                    )}
                    {visibleColumns.map(col => (
                      <td key={col.key} className="px-3 py-3">
                        <div className="h-4 rounded animate-pulse bg-[color:var(--pragmata-border)]" style={{ width: `${50 + (i * 13 + col.key.length * 7) % 40}%` }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length + (actions ? 1 : 0)} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Search className="w-8 h-8 text-[color:var(--pragmata-muted-2)]" />
                      <p className="text-sm font-medium text-[color:var(--pragmata-fg)]">{emptyMessage}</p>
                      <p className="text-xs text-[color:var(--pragmata-muted)]">{emptyDescription}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedData.map((row, rowIdx) => (
                  <tr
                    key={String(row[rowKey])}
                    className={[
                      'group transition-colors hover:bg-[color:var(--pragmata-row-hover)]',
                      rowIdx % 2 === 0 ? 'bg-[color:var(--pragmata-surface)]' : 'bg-[color:var(--pragmata-surface-2)]',
                    ].join(' ')}
                  >
                    {/* Actions cell (sticky) */}
                    {actions && (
                      <td
                        style={{ position: 'sticky', left: 0, width: ACTIONS_WIDTH, minWidth: ACTIONS_WIDTH }}
                        className="bg-inherit px-2 py-2 text-center border-r border-[color:var(--pragmata-border)] shadow-[2px_0_4px_rgba(0,0,0,0.04)]"
                      >
                        {actions(row)}
                      </td>
                    )}
                    {/* Data cells */}
                    {visibleColumns.map((col, colIdx) => {
                      const sticky = stickyStyle(colIdx, visibleColumns as ColumnDef<unknown>[], stickyColumns);
                      const val = resolveValue(row, col.key);
                      return (
                        <td
                          key={col.key}
                          style={{ width: col.width ?? DEFAULT_WIDTH, minWidth: col.width ?? DEFAULT_WIDTH, ...(sticky ?? {}) }}
                          className={[
                            'px-3 py-3 text-sm text-[color:var(--pragmata-fg)]',
                            sticky ? 'bg-inherit shadow-[2px_0_4px_rgba(0,0,0,0.04)]' : '',
                          ].join(' ')}
                        >
                          {col.render ? col.render(val, row) : (
                            <span className="truncate block max-w-[240px]">
                              {val === null || val === undefined ? <span className="text-[color:var(--pragmata-muted-2)]">—</span> : String(val)}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── MOBILE CARDS (< md) ──────────────────────────────────────── */}
        <div className="md:hidden divide-y divide-[color:var(--pragmata-border)]">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-4 space-y-2">
                {visibleColumns.slice(0, 3).map(col => (
                  <div key={col.key} className="flex gap-2">
                    <div className="h-3 w-16 rounded animate-pulse bg-[color:var(--pragmata-border)] flex-shrink-0" />
                    <div className="h-3 flex-1 rounded animate-pulse bg-[color:var(--pragmata-border)]" />
                  </div>
                ))}
              </div>
            ))
          ) : paginatedData.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-sm font-medium text-[color:var(--pragmata-fg)]">{emptyMessage}</p>
              <p className="text-xs text-[color:var(--pragmata-muted)] mt-1">{emptyDescription}</p>
            </div>
          ) : (
            paginatedData.map((row) => (
              <div
                key={String(row[rowKey])}
                className="p-4 space-y-2 hover:bg-[color:var(--pragmata-row-hover)] transition-colors"
              >
                {/* Actions row */}
                {actions && (
                  <div className="flex justify-end mb-1">
                    {actions(row)}
                  </div>
                )}
                {/* Fields as label: value */}
                {visibleColumns.map(col => {
                  const val = resolveValue(row, col.key);
                  return (
                    <div key={col.key} className="flex items-start gap-2 text-sm">
                      <span className="flex-shrink-0 w-28 text-xs font-medium text-[color:var(--pragmata-muted)] pt-0.5">
                        {col.mobileLabel ?? col.header}
                      </span>
                      <span className="flex-1 text-[color:var(--pragmata-fg)] break-words">
                        {col.render ? col.render(val, row) : (
                          val === null || val === undefined
                            ? <span className="text-[color:var(--pragmata-muted-2)]">—</span>
                            : String(val)
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Pagination ───────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-[color:var(--pragmata-muted)]">
        {/* Count + page size */}
        <div className="flex items-center gap-3">
          <span>
            {processedData.length === 0 ? '0 registros' : (
              `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, processedData.length)} de ${processedData.length}`
            )}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs">por página:</span>
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}
              className="text-xs border border-[color:var(--pragmata-border)] rounded bg-[color:var(--pragmata-surface)] text-[color:var(--pragmata-fg)] px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-[color:var(--pragmata-accent)]"
            >
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        {/* Prev / Next */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(0)}
            disabled={page === 0}
            className="px-2 py-1 rounded border border-[color:var(--pragmata-border)] hover:bg-[color:var(--pragmata-surface-2)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs"
          >
            «
          </button>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-2 py-1 rounded border border-[color:var(--pragmata-border)] hover:bg-[color:var(--pragmata-surface-2)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs"
          >
            ‹
          </button>
          <span className="px-3 py-1 text-xs text-[color:var(--pragmata-fg)]">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-2 py-1 rounded border border-[color:var(--pragmata-border)] hover:bg-[color:var(--pragmata-surface-2)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs"
          >
            ›
          </button>
          <button
            onClick={() => setPage(totalPages - 1)}
            disabled={page >= totalPages - 1}
            className="px-2 py-1 rounded border border-[color:var(--pragmata-border)] hover:bg-[color:var(--pragmata-surface-2)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-xs"
          >
            »
          </button>
        </div>
      </div>

      {/* ── Column header dropdown (portal — escapes overflow:hidden) ──────── */}
      {menuOpen && menuAnchor && (() => {
        const col = columns.find(c => c.key === menuOpen);
        if (!col) return null;
        const isFiltered = !!columnFilters[col.key];
        return createPortal(
          <div
            ref={menuRef}
            style={{ position: 'fixed', top: menuAnchor.top, left: menuAnchor.left, zIndex: 9999 }}
            className="min-w-[180px] bg-[color:var(--pragmata-surface)] border border-[color:var(--pragmata-border)] rounded-lg shadow-xl py-1 text-sm"
          >
            {(col.sortable !== false) && (
              <>
                <button
                  onClick={() => { handleSort(col.key, 'asc'); setMenuOpen(null); setMenuAnchor(null); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-[color:var(--pragmata-fg)] hover:bg-[color:var(--pragmata-surface-2)] transition-colors"
                >
                  <ChevronUp className="w-4 h-4 text-[color:var(--pragmata-muted)]" />
                  Ordenar A → Z
                </button>
                <button
                  onClick={() => { handleSort(col.key, 'desc'); setMenuOpen(null); setMenuAnchor(null); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-[color:var(--pragmata-fg)] hover:bg-[color:var(--pragmata-surface-2)] transition-colors"
                >
                  <ChevronDown className="w-4 h-4 text-[color:var(--pragmata-muted)]" />
                  Ordenar Z → A
                </button>
                <div className="my-1 border-t border-[color:var(--pragmata-border)]" />
              </>
            )}
            {(col.filterable !== false) && (
              <button
                onClick={() => { setFilterInputCol(col.key); setMenuOpen(null); setMenuAnchor(null); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-[color:var(--pragmata-fg)] hover:bg-[color:var(--pragmata-surface-2)] transition-colors"
              >
                <Filter className="w-4 h-4 text-[color:var(--pragmata-muted)]" />
                Filtrar por valor
                {isFiltered && <span className="ml-auto text-xs text-[color:var(--pragmata-accent)]">activo</span>}
              </button>
            )}
            <button
              onClick={() => { handleHideColumn(col.key); setMenuOpen(null); setMenuAnchor(null); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-[color:var(--pragmata-fg)] hover:bg-[color:var(--pragmata-surface-2)] transition-colors"
            >
              <EyeOff className="w-4 h-4 text-[color:var(--pragmata-muted)]" />
              Ocultar columna
            </button>
          </div>,
          document.body,
        );
      })()}
    </div>
  );
}
