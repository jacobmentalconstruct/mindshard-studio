
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { PanelType, InspectionData, Role, FileNode, EditorTab } from './types';
import NavBar from './components/NavBar';
import ProjectPanel from './components/ProjectPanel';
import InferencePanel from './components/panels/InferencePanel';
import RightSideContainer from './components/RightSideContainer';
import { ChevronLeftIcon, ChevronRightIcon } from './components/Icons';
import useLocalStorage from './hooks/useLocalStorage';
import { getFileContent, saveFileContent } from './services/mindshardService';


export const ApiKeyContext = React.createContext<{ apiKey: string; setApiKey: (key: string) => void }>({
  apiKey: '',
  setApiKey: () => {},
});

export const OpenFileContext = React.createContext<{ openFilePath: string | null; setOpenFilePath: (path: string | null) => void }>({
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

export const KnowledgeContext = React.createContext<{ targetKbId: string | null; setTargetKbId: (id: string | null) => void, activeKbName: string | null }>({
    targetKbId: null,
    setTargetKbId: () => {},
    activeKbName: null,
});

export const InspectionContext = React.createContext<{ inspectionData: InspectionData | null; setInspectionData: (data: InspectionData | null) => void }>({
  inspectionData: null,
  setInspectionData: () => {},
});

export const RoleContext = React.createContext<{ 
    roles: Role[];
    setRoles: (roles: Role[]) => void;
    activeRole: Role | null; 
    setActiveRole: (role: Role | null) => void; 
}>({
    roles: [],
    setRoles: () => {},
    activeRole: null,
    setActiveRole: () => {},
});

export const ProjectFilesContext = React.createContext<{
  fileTree: FileNode | null;
  setFileTree: (tree: FileNode | null) => void;
  selectedPaths: Set<string>;
  togglePathSelection: (path: string, selected: boolean) => void;
  exclusions: string[];
  setExclusions: (exclusions: string[]) => void;
}>({
  fileTree: null,
  setFileTree: () => {},
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


const App: React.FC = () => {
  const [apiKey, setApiKey] = useState<string>('');
  const [leftPanelVisible, setLeftPanelVisible] = useState(true);
  const [rightPanelVisible, setRightPanelVisible] = useState(true);
  const [rightPanelWidth, setRightPanelWidth] = useState(500);

  const [openFilePath, setOpenFilePath] = useState<string | null>(null);
  const [targetKbId, setTargetKbId] = useState<string | null>(null);
  const [activeKbName, setActiveKbName] = useState<string | null>(null);
  const [inspectionData, setInspectionData] = useState<InspectionData | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [activeRole, setActiveRole] = useLocalStorage<Role | null>('mindshard-active-role', null);

  // Editor State
  const [openTabs, setOpenTabs] = useState<EditorTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);
  const untitledCounter = useRef(1);

  // State for ProjectFilesContext
  const [fileTree, setFileTree] = useState<FileNode | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [exclusions, setExclusions] = useLocalStorage<string[]>('mindshard-exclusions', ['.git', 'node_modules']);

  // State for TaskContext
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // --- Editor Logic ---
  const handleOpenFile = useCallback(async (path: string) => {
    if (!path) return;

    const existingTab = openTabs.find(tab => tab.path === path);
    if (existingTab) {
        setActiveTabPath(path);
        return;
    }

    try {
        const data = await getFileContent(path);
        const isMedia = /\.(png|jpe?g|tiff|pdf)$/i.test(path);

        const newTab: EditorTab = {
            path,
            content: isMedia ? "" : data.content,
            isDirty: false,
            isNew: false,
            isMedia: isMedia,
            viewMode: isMedia ? 'preview' : 'editor',
            mediaContent: isMedia ? data.content : null,
        };

        setOpenTabs(prev => [...prev, newTab]);
        setActiveTabPath(path);
    } catch (error) {
        console.error("Failed to open file:", error);
    }
  }, [openTabs]);

  useEffect(() => {
    if (openFilePath) {
        handleOpenFile(openFilePath);
        // Reset openFilePath so it can be triggered again for the same file if closed and reopened
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
          mediaContent: null
      };
      setOpenTabs(prev => [...prev, newTab]);
      setActiveTabPath(newPath);
      setOpenFilePath(null);
  }, []);
  
  const handleCloseTab = useCallback((path: string, e?: React.MouseEvent) => {
      e?.stopPropagation();

      const tabToClose = openTabs.find(t => t.path === path);
      if (tabToClose?.isDirty) {
          const userResponse = window.confirm(`Save changes to ${tabToClose.path.split('/').pop()}?`);
          if (userResponse) {
              // This save is fire-and-forget, but could be awaited if needed
              saveFileContent(tabToClose.path, tabToClose.content);
          }
      }
      
      const indexToClose = openTabs.findIndex(t => t.path === path);
      const newTabs = openTabs.filter(t => t.path !== path);
      
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
  }, [openTabs, activeTabPath]);
  
  const handleSaveTab = useCallback(async (path: string, saveAs = false) => {
    const tabIndex = openTabs.findIndex(t => t.path === path);
    if (tabIndex === -1) return;
    const tabToSave = openTabs[tabIndex];

    let savePath = tabToSave.path;
    if (saveAs || tabToSave.isNew) {
        const newPath = prompt("Save As... Enter new file path:", tabToSave.path);
        if (!newPath || !newPath.trim()) return; // User cancelled
        savePath = newPath.trim();
    }

    await saveFileContent(savePath, tabToSave.content);
    
    setOpenTabs(tabs => tabs.map((t, i) => {
        if (i === tabIndex) {
            return { ...t, path: savePath, isDirty: false, isNew: false };
        }
        return t;
    }));
    
    if (path !== savePath) {
        setActiveTabPath(savePath);
        if (!tabToSave.isNew) setOpenFilePath(savePath);
    }
  }, [openTabs]);
  
  const handleSaveAllTabs = useCallback(() => {
      openTabs.forEach(tab => {
          if (tab.isDirty && !tab.isNew) {
              handleSaveTab(tab.path);
          }
      });
  }, [openTabs, handleSaveTab]);

  // --- Context Values ---
  const apiKeyContextValue = useMemo(() => ({ apiKey, setApiKey }), [apiKey]);
  const openFileContextValue = useMemo(() => ({ openFilePath, setOpenFilePath }), [openFilePath]);
  const editorContextValue = useMemo(() => ({
    openTabs,
    setOpenTabs,
    activeTabPath,
    setActiveTabPath,
    handleNewTab,
    handleCloseTab,
    handleSaveTab,
    handleSaveAllTabs
  }), [openTabs, activeTabPath, handleNewTab, handleCloseTab, handleSaveTab, handleSaveAllTabs]);
  const knowledgeContextValue = useMemo(() => ({ targetKbId, setTargetKbId, activeKbName }), [targetKbId, activeKbName]);
  const inspectionContextValue = useMemo(() => ({ inspectionData, setInspectionData }), [inspectionData]);
  const roleContextValue = useMemo(() => ({ roles, setRoles, activeRole, setActiveRole }), [roles, activeRole, setRoles, setActiveRole]);
  const taskContextValue = useMemo(() => ({ selectedTaskId, setSelectedTaskId }), [selectedTaskId]);
  
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
  }
  
  const getAllPaths = (node: FileNode): string[] => {
      let paths = [node.path];
      if (node.type === 'directory' && node.children) {
          paths = paths.concat(...node.children.map(getAllPaths));
      }
      return paths;
  };

  const togglePathSelection = useCallback((path: string, selected: boolean) => {
    setSelectedPaths(prev => {
        const newSelected = new Set(prev);
        const node = findNode(fileTree, path);
        if (!node) return newSelected;

        const pathsToUpdate = getAllPaths(node);
        pathsToUpdate.forEach(p => {
            if (selected) {
                newSelected.add(p);
            } else {
                newSelected.delete(p);
            }
        });
        return newSelected;
    });
  }, [fileTree]);

  const projectFilesContextValue = useMemo(() => ({
    fileTree,
    setFileTree,
    selectedPaths,
    togglePathSelection,
    exclusions,
    setExclusions,
  }), [fileTree, selectedPaths, exclusions, togglePathSelection, setExclusions]);

  const handleResize = useCallback((e: MouseEvent) => {
    // Prevent selection of text while resizing
    e.preventDefault();
    const newWidth = window.innerWidth - e.clientX;
    setRightPanelWidth(Math.max(350, Math.min(newWidth, window.innerWidth * 0.7)));
  }, []);

  const stopResizing = useCallback(() => {
    window.removeEventListener('mousemove', handleResize);
    window.removeEventListener('mouseup', stopResizing);
  }, [handleResize]);
  
  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    window.addEventListener('mousemove', handleResize);
    window.addEventListener('mouseup', stopResizing);
  }, [handleResize, stopResizing]);


  return (
    <ApiKeyContext.Provider value={apiKeyContextValue}>
      <OpenFileContext.Provider value={openFileContextValue}>
        <EditorContext.Provider value={editorContextValue}>
          <KnowledgeContext.Provider value={knowledgeContextValue}>
            <InspectionContext.Provider value={inspectionContextValue}>
              <RoleContext.Provider value={roleContextValue}>
                <ProjectFilesContext.Provider value={projectFilesContextValue}>
                  <TaskContext.Provider value={taskContextValue}>
                    <div className="flex flex-col h-screen bg-gray-900 text-gray-200 font-sans">
                      <NavBar />
                      <div className="flex flex-1 overflow-hidden">

                        {/* Left Panel */}
                        <div className={`flex-shrink-0 transition-width duration-300 ease-in-out bg-gray-800/50 ${leftPanelVisible ? 'w-[300px]' : 'w-0'}`}>
                          <div className="w-[300px] h-full overflow-hidden">
                              <ProjectPanel />
                          </div>
                        </div>

                        {/* Center Area (Toggles + Main) */}
                        <div className="flex flex-1 min-w-0 border-x border-gray-700">
                            <div className="flex-shrink-0 flex items-center bg-gray-800/80">
                                <button onClick={() => setLeftPanelVisible(v => !v)} className="h-16 w-6 flex items-center justify-center text-gray-400 hover:text-white hover:bg-cyan-500/50 transition-colors duration-200">
                                    {leftPanelVisible ? <ChevronLeftIcon className="w-5 h-5"/> : <ChevronRightIcon className="w-5 h-5"/>}
                                </button>
                            </div>

                            <main className="flex-1 flex flex-col min-w-0 p-4 bg-gray-900">
                                <InferencePanel/>
                            </main>
                            
                            <div className="flex-shrink-0 flex items-center bg-gray-800/80">
                                <button onClick={() => setRightPanelVisible(v => !v)} className="h-16 w-6 flex items-center justify-center text-gray-400 hover:text-white hover:bg-cyan-500/50 transition-colors duration-200">
                                    {rightPanelVisible ? <ChevronRightIcon className="w-5 h-5"/> : <ChevronLeftIcon className="w-5 h-5"/>}
                                </button>
                            </div>
                        </div>

                        {/* Right Panel */}
                        <div className={`flex-shrink-0 transition-width duration-300 ease-in-out ${rightPanelVisible ? '' : 'w-0'}`} style={rightPanelVisible ? {width: `${rightPanelWidth}px`} : {}}>
                            <div className="flex h-full overflow-hidden" style={{width: `${rightPanelWidth}px`}}>
                                <div onMouseDown={startResizing} className="w-2 h-full cursor-col-resize bg-gray-700 hover:bg-cyan-400 transition-colors flex-shrink-0" />
                                <div className="flex-1 h-full overflow-hidden">
                                    <RightSideContainer />
                                </div>
                            </div>
                        </div>

                      </div>
                    </div>
                  </TaskContext.Provider>
                </ProjectFilesContext.Provider>
              </RoleContext.Provider>
            </InspectionContext.Provider>
          </KnowledgeContext.Provider>
        </EditorContext.Provider>
      </OpenFileContext.Provider>
    </ApiKeyContext.Provider>
  );
};

export default App;
