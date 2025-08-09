// File: frontend/components/panels/ProjectToolsPanel.tsx
import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { FileNode } from '../../types';
import { useAppStore } from '../../stores/appStore';
import { ProjectFilesContext, OpenFileContext } from '../../App';
import { FolderIcon, FileIcon, ChevronRightIcon, TrashIcon, MapPinIcon, ArrowPathIcon } from '../Icons';
import FolderPickerModal from '../common/FolderPickerModal';
import { useNotify } from '../../hooks/useNotify';
import { getFileTree, getFileContent, digestProjectFiles } from '../../services/mindshardService';
import { hasBinaryExt, shouldExcludeByName, EXCLUDED_FOLDERS } from '../../utils/fileFilters';


/* ---------- File tree node ---------- */

interface FileTreeNodeProps {
  node: FileNode;
  selectedPaths: Set<string>;
  onToggleSelect: (path: string, selected: boolean) => void;
  onOpenFile: (path: string) => void;
  openFilePath: string | null;
}

const FileTreeNode: React.FC<FileTreeNodeProps> = ({
  node,
  selectedPaths,
  onToggleSelect,
  onOpenFile,
  openFilePath,
}) => {
  const [isOpen, setIsOpen] = useState(node.type === 'directory');
  const isSelected = selectedPaths.has(node.path);
  const isCurrentlyOpen = openFilePath === node.path;

  return (
    <div className="ml-4">
      <div
        className={`flex items-center py-1 group rounded-md px-1 ${isCurrentlyOpen ? 'bg-cyan-500/20' : ''}`}
      >
        {node.type === 'directory' && (
          <ChevronRightIcon
            className={`h-4 w-4 mr-1 cursor-pointer transition-transform ${isOpen ? 'rotate-90' : ''}`}
            onClick={() => setIsOpen((v) => !v)}
            aria-label={isOpen ? 'Collapse folder' : 'Expand folder'}
            role="button"
          />
        )}

        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onToggleSelect(node.path, e.target.checked)}
          className="mr-2 h-4 w-4 rounded bg-gray-700 border-gray-600 text-cyan-500 focus:ring-cyan-500"
          aria-label={`Select ${node.name}`}
        />

        {node.type === 'directory' ? (
          <FolderIcon className="h-5 w-5 mr-2 text-cyan-400" />
        ) : (
          <FileIcon className="h-5 w-5 mr-2 text-gray-400" />
        )}

        <span
          className={`text-sm ${node.type === 'file' ? 'cursor-pointer hover:text-white' : ''} ${
            isCurrentlyOpen ? 'font-bold text-cyan-300' : ''
          }`}
          onClick={() => node.type === 'file' && onOpenFile(node.path)}
          title={node.path}
        >
          {node.name}
        </span>
      </div>

      {isOpen &&
        node.type === 'directory' &&
        node.children?.map((child) => (
          <FileTreeNode
            key={child.id}
            node={child}
            selectedPaths={selectedPaths}
            onToggleSelect={onToggleSelect}
            onOpenFile={onOpenFile}
            openFilePath={openFilePath}
          />
        ))}
    </div>
  );
};

/* ---------- Panel ---------- */

const ProjectToolsPanel: React.FC = () => {
  const { projectRoot, setProjectRoot, fileTree, refreshFileTree } = useAppStore((s) => ({
    projectRoot: s.projectRoot,
    setProjectRoot: s.setProjectRoot,
    fileTree: s.fileTree,
    refreshFileTree: s.refreshFileTree,
  }));
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [newExclusion, setNewExclusion] = useState('');
  const [checkedExclusions, setCheckedExclusions] = useState<Set<string>>(new Set());
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);

  const { openFilePath, setOpenFilePath } = useContext(OpenFileContext);
  const { selectedPaths, togglePathSelection, exclusions, setExclusions } = useContext(ProjectFilesContext);

  /**
   * Optional-path-aware refresh:
   * - If the store's refreshFileTree accepts a path, call it directly.
   * - Otherwise, fall back to setProjectRoot(path) then refreshFileTree().
   */
  const refreshFileTreeMaybe = useCallback(
    async (path?: string | null) => {
      const fn: any = refreshFileTree as any;
      const acceptsPath = typeof fn === 'function' && fn.length >= 1;

      if (path && acceptsPath) {
        await fn(path);
      } else if (path && path !== projectRoot) {
        setProjectRoot(path);
        await refreshFileTree();
      } else {
        await refreshFileTree();
      }
    },
    [projectRoot, refreshFileTree, setProjectRoot]
  );

  const handleOpenFolder = useCallback(
    async (path: string | null) => {
      if (!path) return;
      setIsLoading(true);
      setStatusMessage('Loading project tree...');
      try {
        await refreshFileTreeMaybe(path);
        setStatusMessage('');
      } catch (err: any) {
        setStatusMessage(`Error: ${err?.message ?? 'Failed to load project tree.'}`);
      } finally {
        setIsLoading(false);
      }
    },
    [refreshFileTreeMaybe]
  );

  const handleRefresh = useCallback(async () => {
    setIsLoading(true);
    setStatusMessage('Loading project…');
    try {
      await refreshFileTreeMaybe();
      setStatusMessage('');
    } catch (err: any) {
      setStatusMessage(`Error: ${err?.message ?? 'Failed to load project.'}`);
    } finally {
      setIsLoading(false);
    }
  }, [refreshFileTreeMaybe]);

  useEffect(() => {
    if (projectRoot) {
      handleRefresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectRoot]);

  /* ----- Exclusions ----- */

  const handleAddExclusion = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newExclusion.trim();
    if (trimmed && !exclusions.includes(trimmed)) {
      setExclusions([...exclusions, trimmed]);
      setNewExclusion('');
    }
  };

  const handleToggleExclusionCheck = (exclusion: string) => {
    setCheckedExclusions((prev) => {
      const next = new Set(prev);
      next.has(exclusion) ? next.delete(exclusion) : next.add(exclusion);
      return next;
    });
  };

  const handleDeleteExclusions = () => {
    setExclusions(exclusions.filter((ex) => !checkedExclusions.has(ex)));
    setCheckedExclusions(new Set());
  };

  /* ----- Filtering ----- */

  const filterNode = useCallback((node: FileNode, currentExclusions: string[]): FileNode | null => {
    const isExcluded = currentExclusions.some((ex) => node.name.includes(ex) || node.path.includes(ex));
    if (isExcluded) return null;

    if (node.type === 'directory' && node.children) {
      const newChildren = node.children
        .map((child) => filterNode(child, currentExclusions))
        .filter(Boolean) as FileNode[];
      return { ...node, children: newChildren };
    }
    return node;
  }, []);

  const filteredTree = useMemo(() => {
    if (!fileTree) return null;
    return filterNode(fileTree, exclusions);
  }, [fileTree, exclusions, filterNode]);

  /* ----- Render ----- */

  return (
    <aside className="w-full h-full p-4 flex flex-col">
      <FolderPickerModal
        isOpen={isFolderPickerOpen}
        onClose={() => setIsFolderPickerOpen(false)}
        onConfirm={(path) => {
          setIsFolderPickerOpen(false);
          handleOpenFolder(path);
        }}
      />

      <header className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2 text-sm text-gray-400">
          <MapPinIcon className="h-4 w-4 text-cyan-400" />
          <span className="truncate max-w-[240px]" title={projectRoot ?? 'No project selected'}>
            {projectRoot ?? 'No project selected'}
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-sm disabled:opacity-50"
            onClick={() => setIsFolderPickerOpen(true)}
            disabled={isLoading}
            aria-label="Open project folder"
          >
            Open…
          </button>
          <button
            className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-sm flex items-center space-x-1 disabled:opacity-50"
            onClick={handleRefresh}
            disabled={!projectRoot || isLoading}
            aria-label="Refresh project tree"
          >
            <ArrowPathIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {statusMessage && (
        <div
          role="status"
          aria-live="polite"
          className="mb-3 px-2 py-1 text-xs rounded border border-gray-700 bg-gray-800 text-gray-300"
        >
          {statusMessage}
        </div>
      )}

      <div className="flex-1 overflow-y-auto pr-2">
        {!filteredTree && !isLoading && (
          <p className="text-sm text-gray-500">Pick a project folder to load its tree.</p>
        )}
        {filteredTree && (
          <FileTreeNode
            node={filteredTree}
            selectedPaths={selectedPaths}
            onToggleSelect={togglePathSelection}
            onOpenFile={setOpenFilePath}
            openFilePath={openFilePath}
          />
        )}
      </div>

      {/* Exclusions manager */}
      <div className="mt-4 border-t border-gray-700 pt-3">
        <form onSubmit={handleAddExclusion} className="flex items-center space-x-2">
          <input
            type="text"
            value={newExclusion}
            onChange={(e) => setNewExclusion(e.target.value)}
            placeholder="Add exclusion (e.g., node_modules, .git)"
            className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm"
            aria-label="Add exclusion"
          />
          <button className="px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 text-sm" type="submit">
            Add
          </button>
        </form>

        <ul className="mt-2 space-y-1">
          {exclusions.map((ex) => (
            <li key={ex} className="flex items-center justify-between text-sm">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={checkedExclusions.has(ex)}
                  onChange={() => handleToggleExclusionCheck(ex)}
                  className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-cyan-500 focus:ring-cyan-500"
                  aria-label={`Select exclusion ${ex}`}
                />
                <span className="text-gray-300">{ex}</span>
              </label>
              <button
                onClick={() => {
                  setCheckedExclusions((prev) => {
                    const next = new Set(prev);
                    next.add(ex);
                    return next;
                  });
                  handleDeleteExclusions();
                }}
                className="p-1 rounded hover:bg-gray-700"
                aria-label={`Remove exclusion ${ex}`}
                title="Remove"
              >
                <TrashIcon className="h-4 w-4 text-gray-400" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
};

export default ProjectToolsPanel;
