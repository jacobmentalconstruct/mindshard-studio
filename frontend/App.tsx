// File: src/App.tsx
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';

import { PanelType, InspectionData, FileNode, EditorTab } from './types';
import NavBar from './components/NavBar';
import ModelStatusChip from './components/ModelStatusChip';
import NativeMenuBar from './components/NativeMenuBar';
import ProjectToolsPanel from './components/panels/ProjectToolsPanel';
import InferencePanel from './components/panels/InferencePanel';
import RightSideContainer from './components/RightSideContainer';
import { ChevronLeftIcon, ChevronRightIcon } from './components/Icons';

import useTauriStore from './hooks/useTauriStore';
import { getFileContent, saveFileContent } from './services/mindshardService';
import { useAppStore } from './stores/appStore';
import { useNotify } from './hooks/useNotify';

/* -------------------- Contexts -------------------- */
export const OpenFileContext = React.createContext<{
  openFilePath: string | null;
  setOpenFilePath: (path: string | null) => void;
}>({
  openFilePath: null,
  setOpenFilePath: () => {},
});

export const EditorContext = React.createContext<{
  openTabs: EditorTab[];
  setOpenTabs: React.Dispatch<React.SetStateAction<EditorTab[]>>;
  activeTabPath: string | null;
  setActiveTabPath: (path: string | null) => void;
  handleNewTab: () => void;
  handleCloseTab: (path: string, e?: React.MouseEvent) => void;
  handleSaveTab: (path: string, saveAs?: boolean) => Promise<void>;
  handleSaveAllTabs: () => void;
}>({
  openTabs: [],
  setOpenTabs: () => {},
  activeTabPath: null,
  setActiveTabPath: () => {},
  handleNewTab: () => {},
  handleCloseTab: () => {},
  handleSaveTab: async () => {},
  handleSaveAllTabs: () => {},
});

export const KnowledgeContext = React.createContext<{
  targetKbId: string | null;
  setTargetKbId: (id: string | null) => void;
  activeKbName: string | null;
}>({
  targetKbId: null,
  setTargetKbId: () => {},
  activeKbName: null,
});

export const InspectionContext = React.createContext<{
  inspectionData: InspectionData | null;
  setInspectionData: (data: InspectionData | null) => void;
}>({
  inspectionData: null,
  setInspectionData: () => {},
});

export const ProjectFilesContext = React.createContext<{
  selectedPaths: Set<string>;
  togglePathSelection: (path: string, selected: boolean) => void;
  exclusions: string[];
  setExclusions: (exclusions: string[]) => void;
}>({
  selectedPaths: new Set(),
  togglePathSelection: () => {},
  exclusions: [],
  setExclusions: () => {},
});

export const TaskContext = React.createContext<{
  selectedTaskId: string | null;
  setSelectedTaskId: (id: string | null) => void;
}>({
  selectedTaskId: null,
  setSelectedTaskId: () => {},
});

/* -------------------- App -------------------- */
const App: React.FC = () => {
  const notify = useNotify.getState();

  // Session-only API key (no persistence).
  const defaultKey = import.meta.env.VITE_DEFAULT_API_KEY ?? '';
  const [apiKey, setApiKeyLocal] = useState<string>(defaultKey);
  const setApiKey = useAppStore((s) => s.setApiKey);
  const fetchModelStatus = useAppStore((s) => s.fetchModelStatus); // Zustand slice you added for model status

  // Reflect to global store so existing consumers work.
  useEffect(() => {
    setApiKey(apiKey);
  }, [apiKey, setApiKey]);

  // Pull LLM status once a key is present (and on key change).
  useEffect(() => {
    if (apiKey?.trim()) {
      fetchModelStatus().catch(() => {
        /* no-op: banner stays, user can retry */
      });
    }
  }, [apiKey, fetchModelStatus]);

  // Layout/UI
  const [leftPanelVisible, setLeftPanelVisible] = useState(true);
  const [rightPanelVisible, setRightPanelVisible] = useState(true);
  const [rightPanelWidth, setRightPanelWidth] = useState(500);

  // Editor
  const [openFilePath, setOpenFilePath] = useState<string | null>(null);
  const [openTabs, setOpenTabs] = useState<EditorTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const untitledCounter = useRef(1);

  // Knowledge & Inspection & Tasks
  const [targetKbId, setTargetKbId] = useState<string | null>(null);
  const [activeKbName, setActiveKbName] = useState<string | null>(null);
  const [inspectionData, setInspectionData] = useState<InspectionData | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Project file tree selection & exclusions
  const { fileTree } = useAppStore((s) => ({
    fileTree: s.fileTree,
  }));
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  // Exclusions are not secret → keep persisted via Tauri store
  const [exclusions, setExclusions] = useTauriStore<string[]>('mindshard-exclusions', ['.git', 'node_modules']);

  /* ---------- File helpers ---------- */
  const findNode = (node: FileNode | null, path: string): FileNode | null => {
    if (!node) return null;
    if (node.path === path) return node;
    if (node.type === 'directory' && node.children) {
      for (const child of node.children) {
        const found = findNode(child, path);
        if (found) return found;
      }
    }
    return null;
  };

  const getAllPaths = (node: FileNode): string[] => {
    let paths = [node.path];
    if (node.type === 'directory' && node.children) {
      paths = paths.concat(...node.children.map(getAllPaths));
    }
    return paths;
  };

  const togglePathSelection = useCallback(
    (path: string, selected: boolean) => {
      setSelectedPaths((prev) => {
        const newSelected = new Set(prev);
        const node = findNode(fileTree, path);
        if (!node) return newSelected;

        const pathsToUpdate = getAllPaths(node);
        pathsToUpdate.forEach((p) => {
          if (selected) newSelected.add(p);
          else newSelected.delete(p);
        });
        return newSelected;
      });
    },
    [fileTree]
  );

  /* ---------- Editor operations ---------- */
  const handleOpenFile = useCallback(
    async (path: string) => {
      if (!path) return;
      const existingTab = openTabs.find((t) => t.path === path);
      if (existingTab) {
        setActiveTabPath(path);
        return;
      }

      try {
        // Pass apiKey so backend can auth the request.
        const data = await getFileContent(apiKey, path);
        const isMedia = /\.(png|jpe?g|tiff|pdf)$/i.test(path);

        const newTab: EditorTab = {
          path,
          content: isMedia ? '' : data.content,
          isDirty: false,
          isNew: false,
          isMedia,
          viewMode: isMedia ? 'preview' : 'editor',
          mediaContent: isMedia ? data.content : null,
        };

        setOpenTabs((prev) => [...prev, newTab]);
        setActiveTabPath(path);
      } catch (err) {
        console.error('Failed to open file:', err);
        notify.error(`Failed to open file: ${path}`);
      }
    },
    [apiKey, openTabs, notify]
  );

  useEffect(() => {
    if (openFilePath) {
      handleOpenFile(openFilePath);
      setOpenFilePath(null);
    }
  }, [openFilePath, handleOpenFile]);

  const handleNewTab = useCallback(() => {
    const newPath = `Untitled-${untitledCounter.current++}`;
    const newTab: EditorTab = {
      path: newPath,
      content: '',
      isDirty: true,
      isNew: true,
      isMedia: false,
      viewMode: 'editor',
      mediaContent: null,
    };
    setOpenTabs((prev) => [...prev, newTab]);
    setActiveTabPath(newPath);
    setOpenFilePath(null);
  }, []);

  const handleSaveTab = useCallback(
    async (path: string, saveAs = false) => {
      const tabIndex = openTabs.findIndex((t) => t.path === path);
      if (tabIndex === -1) return;
      const tabToSave = openTabs[tabIndex];

      let savePath = tabToSave.path;
      if (saveAs || tabToSave.isNew) {
        const newPath = prompt('Save As... Enter new file path:', tabToSave.path);
        if (!newPath || !newPath.trim()) return;
        savePath = newPath.trim();
      }

      try {
        // Pass apiKey for auth.
        await saveFileContent(apiKey, savePath, tabToSave.content);
        notify.success(`Saved ${savePath}`);

        setOpenTabs((tabs) =>
          tabs.map((t, i) => (i === tabIndex ? { ...t, path: savePath, isDirty: false, isNew: false } : t))
        );

        if (path !== savePath) {
          setActiveTabPath(savePath);
          if (!tabToSave.isNew) setOpenFilePath(savePath);
        }
      } catch (err) {
        console.error('Failed to save file:', err);
        notify.error(`Failed to save file: ${savePath}`);
      }
    },
    [apiKey, openTabs, notify]
  );

  const handleCloseTab = useCallback(
    (path: string, e?: React.MouseEvent) => {
      e?.stopPropagation();
      const tabToClose = openTabs.find((t) => t.path === path);
      if (tabToClose?.isDirty) {
        if (window.confirm(`Save changes to ${tabToClose.path.split('/').pop()}?`)) {
          void handleSaveTab(tabToClose.path);
        }
      }

      const indexToClose = openTabs.findIndex((t) => t.path === path);
      const newTabs = openTabs.filter((t) => t.path !== path);
      setOpenTabs(newTabs);

      if (path === activeTabPath) {
        if (newTabs.length > 0) {
          const newIndex = Math.max(0, indexToClose - 1);
          const newActiveTab = newTabs[newIndex];
          setActiveTabPath(newActiveTab.path);
          if (!newActiveTab.isNew) setOpenFilePath(newActiveTab.path);
        } else {
          setActiveTabPath(null);
          setOpenFilePath(null);
        }
      }
    },
    [openTabs, activeTabPath, handleSaveTab]
  );

  const handleSaveAllTabs = useCallback(() => {
    openTabs.forEach((tab) => {
      if (tab.isDirty && !tab.isNew) {
        void handleSaveTab(tab.path);
      }
    });
  }, [openTabs, handleSaveTab]);

  /* ---------- Context values ---------- */
  const openFileContextValue = useMemo(
    () => ({ openFilePath, setOpenFilePath }),
    [openFilePath]
  );

  const editorContextValue = useMemo(
    () => ({
      openTabs,
      setOpenTabs,
      activeTabPath,
      setActiveTabPath,
      handleNewTab,
      handleCloseTab,
      handleSaveTab,
      handleSaveAllTabs,
    }),
    [openTabs, activeTabPath, handleNewTab, handleCloseTab, handleSaveTab, handleSaveAllTabs]
  );

  const knowledgeContextValue = useMemo(
    () => ({ targetKbId, setTargetKbId, activeKbName }),
    [targetKbId, activeKbName]
  );

  const inspectionContextValue = useMemo(
    () => ({ inspectionData, setInspectionData }),
    [inspectionData]
  );

  const projectFilesContextValue = useMemo(
    () => ({
      selectedPaths,
      togglePathSelection,
      exclusions,
      setExclusions,
    }),
    [selectedPaths, exclusions, togglePathSelection, setExclusions]
  );

  const taskContextValue = useMemo(
    () => ({ selectedTaskId, setSelectedTaskId }),
    [selectedTaskId]
  );

  /* ---------- Right panel resizing ---------- */
  const handleResize = useCallback((e: MouseEvent) => {
    e.preventDefault();
    const newWidth = window.innerWidth - e.clientX;
    setRightPanelWidth(Math.max(350, Math.min(newWidth, window.innerWidth * 0.7)));
  }, []);

  const stopResizing = useCallback(() => {
    window.removeEventListener('mousemove', handleResize);
    window.removeEventListener('mouseup', stopResizing);
  }, [handleResize]);

  const startResizing = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      window.addEventListener('mousemove', handleResize);
      window.addEventListener('mouseup', stopResizing);
    },
    [handleResize, stopResizing]
  );

  /* ---------- API Key banner ---------- */
  const ApiKeyBanner: React.FC = () => {
    if (apiKey && apiKey.trim() !== '') return null;
    return (
      <div className="bg-amber-900/30 border-b border-amber-700 text-amber-100 px-4 py-2 flex items-center gap-2">
        <span className="text-sm">API Key required:</span>
        <input
          type="password"
          placeholder="Enter API key…"
          value={apiKey}
          onChange={(e) => setApiKeyLocal(e.target.value)}
          className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-600"
          aria-label="API key"
          autoFocus
        />
        <span className="text-xs opacity-70">(session only)</span>
      </div>
    );
  };

  /* -------------------- Render -------------------- */
  return (
    <OpenFileContext.Provider value={openFileContextValue}>
      <EditorContext.Provider value={editorContextValue}>
        <KnowledgeContext.Provider value={knowledgeContextValue}>
          <InspectionContext.Provider value={inspectionContextValue}>
            <ProjectFilesContext.Provider value={projectFilesContextValue}>
              <TaskContext.Provider value={taskContextValue}>
                <Toaster
                  position="bottom-right"
                  toastOptions={{
                    className: '',
                    style: {
                      margin: '10px',
                      background: '#374151',
                      color: '#e5e7eb',
                      border: '1px solid #4b5563',
                    },
                  }}
                />
                <div className="flex flex-col h-screen bg-gray-900 text-gray-200 font-sans">
                  <NativeMenuBar />
                  <NavBar />
				  <div className="px-4 py-2 border-b border-gray-800 bg-gray-900">
				    <ModelStatusChip />
				  </div>
                  {/* API key banner appears until a key is provided */}
                  <ApiKeyBanner />

                  <div className="flex flex-1 overflow-hidden">
                    {/* Left Panel */}
                    <div
                      className={`flex-shrink-0 transition-width duration-300 ease-in-out bg-gray-800/50 ${
                        leftPanelVisible ? 'w-[300px]' : 'w-0'
                      }`}
                    >
                      <div className="w-[300px] h-full overflow-hidden">
                        <ProjectToolsPanel />
                      </div>
                    </div>

                    {/* Center Area */}
                    <div className="flex flex-1 min-w-0 border-x border-gray-700">
                      <div className="flex-shrink-0 flex items-center bg-gray-800/80">
                        <button
                          onClick={() => setLeftPanelVisible((v) => !v)}
                          className="h-16 w-6 flex items-center justify-center text-gray-400 hover:text-white hover:bg-cyan-500/50 transition-colors duration-200"
                        >
                          {leftPanelVisible ? (
                            <ChevronLeftIcon className="w-5 h-5" />
                          ) : (
                            <ChevronRightIcon className="w-5 h-5" />
                          )}
                        </button>
                      </div>

                      <main className="flex-1 flex flex-col min-w-0 p-4 bg-gray-900">
                        <InferencePanel />
                      </main>

                      <div className="flex-shrink-0 flex items-center bg-gray-800/80">
                        <button
                          onClick={() => setRightPanelVisible((v) => !v)}
                          className="h-16 w-6 flex items-center justify-center text-gray-400 hover:text-white hover:bg-cyan-500/50 transition-colors duration-200"
                        >
                          {rightPanelVisible ? (
                            <ChevronRightIcon className="w-5 h-5" />
                          ) : (
                            <ChevronLeftIcon className="w-5 h-5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Right Panel */}
                    <div
                      className={`flex-shrink-0 transition-width duration-300 ease-in-out ${
                        rightPanelVisible ? '' : 'w-0'
                      }`}
                      style={rightPanelVisible ? { width: `${rightPanelWidth}px` } : {}}
                    >
                      <div className="flex h-full overflow-hidden" style={{ width: `${rightPanelWidth}px` }}>
                        <div
                          onMouseDown={startResizing}
                          className="w-2 h-full cursor-col-resize bg-gray-700 hover:bg-cyan-400 transition-colors flex-shrink-0"
                        />
                        <div className="flex-1 h-full overflow-hidden">
                          <RightSideContainer />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </TaskContext.Provider>
            </ProjectFilesContext.Provider>
          </InspectionContext.Provider>
        </KnowledgeContext.Provider>
      </EditorContext.Provider>
    </OpenFileContext.Provider>
  );
};

export default App;
