// File: src/components/KnowledgePanel.tsx
import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  memo,
} from 'react';
import { KnowledgeBase } from '../../types';
import {
  getKnowledgeBases,
  createKnowledgeBase,
  activateKnowledgeBase,
  deleteKnowledgeBase,
} from '../../services/mindshardService';
import { useAppStore } from '../../stores/appStore';
import { useApi } from '../../hooks/useApi';

// Icons (single import)
import {
  TrashIcon,
  GlobeAltIcon,
  FileIcon,
  CheckCircleIcon,
  RefreshIcon,
  PlusIcon,
  SearchIcon,
  ChevronLeftIcon,
} from '../Icons';

// ---------- Utilities ----------
const classNames = (...xs: Array<string | false | null | undefined>) =>
  xs.filter(Boolean).join(' ');

// NOTE: If your `KnowledgeBase` does not define these fields, adjust below carefully.
type KbSource = {
  id: string;
  type: 'file' | 'url';
  name: string;
};

type KB = KnowledgeBase & {
  sources?: KbSource[];
  // updatedAt?: string; // if you add later, we can sort by recency
};

// ---------- Inline Create Form ----------
const InlineCreateForm = memo(function InlineCreateForm({
  onCreate,
  disabled,
}: {
  onCreate: (name: string) => Promise<void>;
  disabled: boolean;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const trimmed = name.trim();
      if (!trimmed || busy || disabled) return;
      try {
        setBusy(true);
        await onCreate(trimmed);
        setName('');
        // keep focus for rapid entry
        inputRef.current?.focus();
      } finally {
        setBusy(false);
      }
    },
    [name, busy, disabled, onCreate]
  );

  return (
    <form
      onSubmit={submit}
      className="flex items-center gap-2 w-full"
      aria-label="Create Knowledge Base"
    >
      <div className="flex-1 relative">
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="New knowledge base name…"
          className="w-full rounded border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-600"
          disabled={disabled || busy}
          aria-disabled={disabled || busy}
        />
        <SearchIcon className="hidden" /> {/* keeps icon tree consistent if you style inputs */}
      </div>
      <button
        type="submit"
        disabled={disabled || busy || !name.trim()}
        className={classNames(
          'inline-flex items-center gap-1 rounded bg-cyan-600 px-3 py-2 text-sm font-semibold text-white transition',
          disabled || busy || !name.trim()
            ? 'opacity-60 cursor-not-allowed'
            : 'hover:bg-cyan-500'
        )}
        aria-label="Create"
      >
        <PlusIcon className="h-4 w-4" />
        Create
      </button>
    </form>
  );
});

// ---------- Row Component ----------
const KbRow = memo(function KbRow({
  kb,
  onExplore,
  onDelete,
  onActivate,
  activating,
  deleting,
}: {
  kb: KB;
  onExplore: (kb: KB) => void;
  onDelete: (id: string) => void;
  onActivate: (id: string, nextActive: boolean) => void;
  activating: boolean;
  deleting: boolean;
}) {
  return (
    <div
      className={classNames(
        'p-3 rounded-lg border flex items-center justify-between',
        kb.system
          ? 'bg-cyan-900/30 border-cyan-700/50'
          : 'bg-gray-700/50 border-gray-600'
      )}
      data-testid={`kb-row-${kb.id}`}
    >
      <div>
        <h4
          className={classNames(
            'font-bold text-lg',
            kb.system ? 'text-cyan-300' : 'text-cyan-400'
          )}
        >
          {kb.name}
        </h4>
        <p
          className={classNames(
            'text-xs',
            kb.system ? 'text-cyan-400' : 'text-gray-400'
          )}
        >
          {kb.contentCount ?? 0} {kb.contentCount === 1 ? 'source' : 'sources'}
        </p>
      </div>

      <div className="flex items-center gap-3">
        {/* Explore */}
        <button
          onClick={() => onExplore(kb)}
          className="text-sm bg-gray-600 hover:bg-gray-500 py-1 px-3 rounded"
          aria-label={`Explore ${kb.name}`}
        >
          Explore
        </button>

        {/* Delete */}
        {!kb.system && (
          <button
            onClick={() => onDelete(kb.id)}
            disabled={deleting}
            className={classNames(
              'p-1 rounded-full bg-gray-800/50 hover:bg-gray-800 text-red-500 hover:text-red-400',
              deleting && 'opacity-60 cursor-wait'
            )}
            aria-label={`Delete ${kb.name}`}
          >
            {deleting ? (
              <RefreshIcon className="h-5 w-5 animate-spin" />
            ) : (
              <TrashIcon className="h-5 w-5" />
            )}
          </button>
        )}

        {/* Activate toggle */}
        <label
          title="Activate this KB"
          className="flex items-center text-sm gap-2 cursor-pointer select-none"
        >
          <span className="text-gray-400">Active</span>
          <div className="relative">
            <input
              type="checkbox"
              checked={!!kb.active}
              onChange={(e) => onActivate(kb.id, e.target.checked)}
              className="sr-only peer"
              aria-label={`Toggle active for ${kb.name}`}
              disabled={activating}
            />
            <div
              className={classNames(
                'w-11 h-6 rounded-full transition after:content-[""] after:absolute after:top-0.5 after:left-[2px] after:rounded-full after:h-5 after:w-5 after:transition',
                activating && 'opacity-60',
                kb.active
                  ? 'bg-green-500 after:translate-x-full after:bg-white after:border-white'
                  : 'bg-gray-600 after:bg-white after:border-gray-300'
              )}
            ></div>
          </div>
        </label>
      </div>
    </div>
  );
});

// ---------- Empty State ----------
const EmptyState = memo(function EmptyState({
  title,
  message,
  actionSlot,
}: {
  title: string;
  message: string;
  actionSlot?: React.ReactNode;
}) {
  return (
    <div className="rounded border border-dashed border-gray-600 bg-gray-800/40 p-6 text-center">
      <h3 className="text-lg font-semibold text-gray-200">{title}</h3>
      <p className="mt-1 text-sm text-gray-400">{message}</p>
      {actionSlot && <div className="mt-3">{actionSlot}</div>}
    </div>
  );
});

// ---------- Main Panel ----------
const KnowledgePanel: React.FC = () => {
  // Prefer app store for apiKey; fallback to ApiKeyContext if you actually use it.
  const storeApiKey = useAppStore((s) => s.apiKey);
  // const { apiKey: contextApiKey } = useContext(ApiKeyContext);
  const apiKey = storeApiKey; // || contextApiKey;

  // Local UI state
  const [exploredKb, setExploredKb] = useState<KB | null>(null);
  const [filter, setFilter] = useState('');
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Track per-row action loads to avoid janky global spinners
  const [activatingIds, setActivatingIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  // Avoid state updates after unmount
  const mountedRef = useRef(true);
  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Data fetch
  const {
    data: knowledgeBases,
    isLoading,
    error,
    refetch,
  } = useApi(getKnowledgeBases, apiKey);

  // Helper: consistent action execution with error capture & optional optimistic updates
  const safeAction = useCallback(
    async <T,>(
      label: string,
      fn: () => Promise<T>,
      opts?: { onFinallyRefetch?: boolean; optimistic?: () => void; revert?: () => void }
    ) => {
      setBannerError(null);
      try {
        if (opts?.optimistic) opts.optimistic();
        return await fn();
      } catch (err: any) {
        const msg =
          err?.message || `Failed to ${label}. Please try again or refresh.`;
        if (mountedRef.current) setBannerError(msg);
        if (opts?.revert) opts.revert();
        return undefined as unknown as T;
      } finally {
        if (opts?.onFinallyRefetch && mountedRef.current) {
          // SWR-ish refresh after mutation
          refetch();
        }
      }
    },
    [refetch]
  );

  // Mutations
  const handleCreate = useCallback(
    async (name: string) => {
      if (!apiKey) {
        setBannerError('Missing API key. Configure it in Settings.');
        return;
      }
      await safeAction(
        'create knowledge base',
        () => createKnowledgeBase(apiKey, name),
        { onFinallyRefetch: true }
      );
    },
    [apiKey, safeAction]
  );

  const handleActivate = useCallback(
    async (id: string, nextActive: boolean) => {
      if (!apiKey) {
        setBannerError('Missing API key. Configure it in Settings.');
        return;
      }
      setActivatingIds((s) => new Set(s).add(id));
      // Example optimistic update: flip the active bit locally immediately.
      // We only do this if we have data; revert on failure.
      let reverted = false;
      const revert = () => {
        reverted = true;
      };

      await safeAction(
        'activate knowledge base',
        () => activateKnowledgeBase(apiKey, id),
        {
          onFinallyRefetch: true,
          optimistic: () => {
            // no local cache here; we just show a toggle spinner
          },
          revert,
        }
      );

      // Clear spinner
      if (mountedRef.current) {
        setActivatingIds((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
      }
    },
    [apiKey, safeAction]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (!apiKey) {
        setBannerError('Missing API key. Configure it in Settings.');
        return;
      }
      // You can replace this confirm with a nicer modal in your design system.
      const confirmed = window.confirm(
        'Delete this knowledge base? This cannot be undone.'
      );
      if (!confirmed) return;

      setDeletingIds((s) => new Set(s).add(id));

      await safeAction('delete knowledge base', () => deleteKnowledgeBase(apiKey, id), {
        onFinallyRefetch: true,
      });

      if (mountedRef.current) {
        setDeletingIds((s) => {
          const n = new Set(s);
          n.delete(id);
          return n;
        });
        if (exploredKb?.id === id) setExploredKb(null);
      }
    },
    [apiKey, safeAction, exploredKb?.id]
  );

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setBannerError(null);
    try {
      await refetch();
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, [refreshing, refetch]);

  // Derived data
  const allKbs: KB[] = useMemo(() => knowledgeBases ?? [], [knowledgeBases]);

  const filteredKbs: KB[] = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return allKbs;
    return allKbs.filter(
      (kb) =>
        kb.name.toLowerCase().includes(f) ||
        (kb.contentCount ?? 0).toString() === f
    );
  }, [allKbs, filter]);

  const { systemKbs, userKbs, counts } = useMemo(() => {
    const system: KB[] = [];
    const user: KB[] = [];
    for (const kb of filteredKbs) {
      if (kb.system) system.push(kb);
      else user.push(kb);
    }
    // Optional: stable sort for UX
    system.sort((a, b) => a.name.localeCompare(b.name));
    user.sort((a, b) => a.name.localeCompare(b.name));
    return {
      systemKbs: system,
      userKbs: user,
      counts: { system: system.length, user: user.length, all: filteredKbs.length },
    };
  }, [filteredKbs]);

  // Early returns / gates
  if (!apiKey) {
    return (
      <div className="p-4">
        <EmptyState
          title="API Key Required"
          message="Set your API key in Settings to manage knowledge bases."
          actionSlot={<div className="text-sm text-gray-500">No key detected.</div>}
        />
      </div>
    );
  }

  // Initial loading
  if (isLoading) return <p className="p-4">Loading knowledge bases...</p>;

  // Hard fetch error (still show retry path + create action)
  // Prefer a non-blocking banner instead of a full stop.
  const fatalError =
    error && !knowledgeBases
      ? (error as Error)?.message ?? 'Failed to load knowledge bases.'
      : null;

  // ---------- Explore View ----------
  if (exploredKb) {
    return (
      <div className="p-4 flex flex-col h-full">
        <div className="flex items-center justify-between border-b border-gray-700 pb-2 mb-4">
          <h2 className="text-xl font-bold text-gray-300">
            {`Exploring: ${exploredKb.name}`}
          </h2>
          <button
            onClick={() => setExploredKb(null)}
            className="inline-flex items-center gap-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-1 px-3 rounded text-sm transition"
          >
            <ChevronLeftIcon className="h-4 w-4" />
            Back
          </button>
        </div>

        {/* Banner error within subview */}
        {bannerError && (
          <div
            className="mb-3 rounded border border-red-500/40 bg-red-900/30 p-3 text-sm text-red-200"
            role="alert"
          >
            {bannerError}
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-3 pr-2">
          <h3 className="text-lg font-semibold">Digested Sources</h3>
          {exploredKb.sources && exploredKb.sources.length > 0 ? (
            exploredKb.sources.map((source) => (
              <div
                key={source.id}
                className="bg-gray-700/50 p-2 rounded flex items-center justify-between"
              >
                <div className="flex items-center space-x-2">
                  {source.type === 'file' ? (
                    <FileIcon className="h-5 w-5 text-gray-400" />
                  ) : (
                    <GlobeAltIcon className="h-5 w-5 text-cyan-400" />
                  )}
                  <span className="text-sm font-mono">{source.name}</span>
                </div>
                {/* TODO: wire remove-source when API is available */}
                <button
                  title="Remove source"
                  className="text-red-500 hover:text-red-400"
                  disabled
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            ))
          ) : (
            <p className="text-gray-500">No sources found in this Knowledge Base.</p>
          )}
        </div>
      </div>
    );
  }

  // ---------- List View ----------
  return (
    <div className="p-4 flex flex-col h-full">
      <div className="flex items-center justify-between flex-wrap gap-3 border-b border-gray-700 pb-2 mb-4">
        <h2 className="text-xl font-bold text-gray-300">Library of KBs</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className={classNames(
              'inline-flex items-center gap-1 rounded bg-gray-700 px-3 py-2 text-sm font-semibold text-white transition',
              refreshing ? 'opacity-60 cursor-wait' : 'hover:bg-gray-600'
            )}
          >
            <RefreshIcon
              className={classNames('h-4 w-4', refreshing && 'animate-spin')}
            />
            Refresh
          </button>
        </div>
      </div>

      {/* Non-blocking error banner */}
      {(fatalError || bannerError) && (
        <div
          className="mb-3 rounded border border-red-500/40 bg-red-900/30 p-3 text-sm text-red-200 flex items-center justify-between"
          role="alert"
        >
          <span>{fatalError ?? bannerError}</span>
          <button
            onClick={handleRefresh}
            className="rounded bg-red-700/50 px-2 py-1 text-xs font-semibold hover:bg-red-700/70"
          >
            Retry
          </button>
        </div>
      )}

      {/* Create + Filter */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between mb-3">
        <InlineCreateForm onCreate={handleCreate} disabled={refreshing} />
        <div className="relative w-full md:w-64">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name or count…"
            className="w-full rounded border border-gray-600 bg-gray-800 pl-9 pr-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-cyan-600"
            aria-label="Filter Knowledge Bases"
          />
          <SearchIcon className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
        </div>
      </div>

      {/* Counts */}
      <div className="flex items-center gap-4 text-xs text-gray-400 mb-2">
        <span>Total: {counts.all}</span>
        <span>System: {counts.system}</span>
        <span>User: {counts.user}</span>
      </div>

      {/* System KB Section */}
      {systemKbs.length > 0 && (
        <div className="space-y-2 flex-shrink-0 mb-4">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
            Live State
          </h3>
          {systemKbs.map((kb) => (
            <div
              key={kb.id}
              className="bg-cyan-900/30 p-3 rounded-lg border border-cyan-700/50 flex items-center justify-between"
            >
              <div>
                <h4 className="font-bold text-lg text-cyan-300">{kb.name}</h4>
                <p className="text-xs text-cyan-400">
                  {kb.contentCount ?? 0} files indexed
                </p>
              </div>
              <div className="flex items-center space-x-2 text-green-400 text-sm">
                <CheckCircleIcon className="h-5 w-5" />
                <span>Active &amp; Synced</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* User KBs */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-2 min-h-0">
        {userKbs.length === 0 ? (
          <EmptyState
            title="No user knowledge bases yet"
            message="Create one above to begin curating your project memory."
          />
        ) : (
          userKbs.map((kb) => (
            <KbRow
              key={kb.id}
              kb={kb}
              onExplore={setExploredKb}
              onDelete={handleDelete}
              onActivate={handleActivate}
              deleting={deletingIds.has(kb.id)}
              activating={activatingIds.has(kb.id)}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default KnowledgePanel;
