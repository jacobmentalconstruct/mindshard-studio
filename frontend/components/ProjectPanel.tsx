import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { FileNode } from '../types';
import { getFileTree, digestProject, undigestProject, getJobStatus } from '../services/mindshardService';
import { ApiKeyContext, OpenFileContext, KnowledgeContext, ProjectFilesContext } from '../App';
import { FolderIcon, FileIcon, ChevronRightIcon, TrashIcon, MapPinIcon, ArrowPathIcon } from './Icons';

interface FileTreeNodeProps {
  node: FileNode;
  selectedPaths: Set<string>;
  onToggleSelect: (path: string, selected: boolean) => void;
  onOpenFile: (path: string) => void;
  openFilePath: string | null;
}

const FileTreeNodeComponent: React.FC<FileTreeNodeProps> = ({ node, selectedPaths, onToggleSelect, onOpenFile, openFilePath }) => {
  const [isOpen, setIsOpen] = useState(node.type === 'directory');

  const isSelected = selectedPaths.has(node.path);
  const isCurrentlyOpen = openFilePath === node.path;

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    onToggleSelect(node.path, e.target.checked);
  };

  return (
    <div className="ml-4">
      <div className={`flex items-center py-1 group rounded-md px-1 ${isCurrentlyOpen ? 'bg-cyan-500/20' : ''}`}>
        {node.type === 'directory' && (
          <ChevronRightIcon 
            className={`h-4 w-4 mr-1 cursor-pointer transition-transform ${isOpen ? 'rotate-90' : ''}`}
            onClick={() => setIsOpen(!isOpen)} 
          />
        )}
        <input type="checkbox" checked={isSelected} onChange={handleSelect} className="mr-2 h-4 w-4 rounded bg-gray-700 border-gray-600 text-cyan-500 focus:ring-cyan-500"/>
        {node.type === 'directory' ? <FolderIcon className="h-5 w-5 mr-2 text-cyan-400" /> : <FileIcon className="h-5 w-5 mr-2 text-gray-400" />}
        <span 
          className={`text-sm ${node.type === 'file' ? 'cursor-pointer hover:text-white' : ''} ${isCurrentlyOpen ? 'font-bold text-cyan-300' : ''}`}
          onClick={() => node.type === 'file' && onOpenFile(node.path)}
        >
          {node.name}
        </span>
      </div>
      {isOpen && node.type === 'directory' && node.children?.map(child => (
        <FileTreeNodeComponent key={child.id} node={child} selectedPaths={selectedPaths} onToggleSelect={onToggleSelect} onOpenFile={onOpenFile} openFilePath={openFilePath}/>
      ))}
    </div>
  );
};


const ProjectPanel: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [newExclusion, setNewExclusion] = useState('');
  const [checkedExclusions, setCheckedExclusions] = useState<Set<string>>(new Set());

  const { apiKey } = useContext(ApiKeyContext);
  const { openFilePath, setOpenFilePath } = useContext(OpenFileContext);
  const { targetKbId } = useContext(KnowledgeContext);
  const { fileTree, setFileTree, selectedPaths, togglePathSelection, exclusions, setExclusions } = useContext(ProjectFilesContext);
  
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

  const handleOpenFolder = useCallback(() => {
    setIsLoading(true);
    setStatusMessage('Loading project...');
    getFileTree().then(tree => {
      setFileTree(tree);
      setIsLoading(false);
      setStatusMessage('');
    }).catch(() => {
        setIsLoading(false);
        setStatusMessage('Failed to load project.');
    });
  }, [setFileTree]);
    
  useEffect(() => {
      handleOpenFolder();
  }, [handleOpenFolder]);

  const handleSetRoot = () => {
      if (selectedPaths.size !== 1) return;
      const path = selectedPaths.values().next().value;
      const node = findNode(fileTree, path);
      if (node && node.type === 'directory') {
          setStatusMessage(`Project root set to: ${path}`);
          // Logic to actually set the root would go here
          console.log("Setting project root to:", path);
      }
  }
  
  const handleAddExclusion = (e: React.FormEvent) => {
    e.preventDefault();
    if (newExclusion && !exclusions.includes(newExclusion)) {
        setExclusions([...exclusions, newExclusion]);
        setNewExclusion('');
    }
  };

  const handleToggleExclusionCheck = (exclusion: string) => {
      setCheckedExclusions(prev => {
          const newSet = new Set(prev);
          if (newSet.has(exclusion)) {
              newSet.delete(exclusion);
          } else {
              newSet.add(exclusion);
          }
          return newSet;
      });
  };

  const handleDeleteExclusions = () => {
      setExclusions(exclusions.filter(ex => !checkedExclusions.has(ex)));
      setCheckedExclusions(new Set());
  };
  
  const filterNode = useCallback((node: FileNode, currentExclusions: string[]): FileNode | null => {
    const isExcluded = currentExclusions.some(ex => node.name.includes(ex) || node.path.includes(ex));
    if (isExcluded) return null;

    if (node.type === 'directory' && node.children) {
        const newChildren = node.children.map(child => filterNode(child, currentExclusions)).filter(Boolean) as FileNode[];
        return { ...node, children: newChildren };
    }
    return node;
  }, []);

  const filteredTree = useMemo(() => {
    if (!fileTree) return null;
    return filterNode(fileTree, exclusions);
  }, [fileTree, exclusions, filterNode]);

  const isSingleDirectorySelected = useMemo(() => {
    if (selectedPaths.size !== 1) return false;
    const path = selectedPaths.values().next().value;
    const node = findNode(fileTree, path);
    return node?.type === 'directory';
  }, [selectedPaths, fileTree]);

  return (
    <aside className="w-full h-full p-4 flex flex-col">
      <div className="flex-shrink-0">
        <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Project Explorer</h2>
        </div>
      </div>
      
      <div className="flex-shrink-0 mt-4 pb-4 border-b border-gray-700 space-y-3">
        {statusMessage && <div className="text-xs text-cyan-300 text-center h-4">{statusMessage}</div>}
        <div className="flex items-center justify-between space-x-2">
            <button onClick={handleSetRoot} disabled={!isSingleDirectorySelected} className="w-1/2 text-sm bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-3 rounded transition disabled:bg-gray-500 disabled:cursor-not-allowed flex items-center justify-center space-x-2">
                <MapPinIcon className="h-4 w-4" />
                <span>Set Root</span>
            </button>
            <button onClick={handleOpenFolder} disabled={isLoading} className="w-1/2 text-sm bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-3 rounded transition disabled:bg-gray-500 flex items-center justify-center space-x-2">
                <ArrowPathIcon className="h-4 w-4" />
                <span>{isLoading ? 'Loading...' : 'Refresh'}</span>
            </button>
        </div>
      </div>


      <div className="flex-1 overflow-y-auto bg-gray-900/50 p-2 rounded-lg mt-4 min-h-0">
        {filteredTree ? (
            <FileTreeNodeComponent node={filteredTree} selectedPaths={selectedPaths} onToggleSelect={togglePathSelection} onOpenFile={setOpenFilePath} openFilePath={openFilePath} />
        ) : (
            <p className="text-sm text-gray-500 p-4 text-center">Click "Refresh" to load a project.</p>
        )}
      </div>

      <div className="flex-shrink-0 mt-4 pt-4 border-t border-gray-700">
        <div className="bg-gray-900/70 p-3 rounded-lg border border-gray-700 space-y-3">
            <h3 className="text-md font-semibold text-gray-300 border-b border-gray-600 pb-2 mb-3">Settings</h3>

            <div className="space-y-2">
                <label className="font-semibold text-gray-400 text-sm">Exclusions</label>
                <form onSubmit={handleAddExclusion} className="flex space-x-2">
                    <input type="text" value={newExclusion} onChange={e => setNewExclusion(e.target.value)} placeholder="Add exclusion (e.g., *.log)" className="flex-grow bg-gray-800 text-sm p-2 rounded border border-gray-600"/>
                    <button type="submit" className="text-sm bg-gray-600 hover:bg-gray-500 text-white font-bold py-1 px-2 rounded transition">Add</button>
                </form>
                <div className="max-h-24 overflow-y-auto space-y-1 pr-2">
                    {exclusions.map(ex => (
                        <div key={ex} className="flex items-center justify-between bg-gray-800 p-1.5 rounded">
                            <label className="flex items-center text-sm space-x-2 cursor-pointer w-full">
                                <input type="checkbox" checked={checkedExclusions.has(ex)} onChange={() => handleToggleExclusionCheck(ex)} className="rounded bg-gray-700 border-gray-600 text-cyan-500 focus:ring-cyan-500"/>
                                <span className="font-mono">{ex}</span>
                            </label>
                        </div>
                    ))}
                </div>
                {checkedExclusions.size > 0 && 
                    <button onClick={handleDeleteExclusions} className="w-full text-sm bg-red-600/80 hover:bg-red-700/80 text-white font-bold py-1 px-3 rounded transition flex items-center justify-center space-x-2">
                        <TrashIcon className="h-4 w-4"/>
                        <span>Delete Selected</span>
                    </button>
                }
            </div>
        </div>
      </div>
    </aside>
  );
};

export default ProjectPanel;
