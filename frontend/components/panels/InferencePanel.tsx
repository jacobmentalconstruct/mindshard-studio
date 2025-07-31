

import React, { useState, useEffect, useContext, useCallback, useRef, useMemo } from 'react';
import { Editor } from "@monaco-editor/react";
import { SystemStatus, KnowledgeBase, PromptTemplate, Role, StreamEntry, Scratchpad, SystemMetrics } from '../../types';
import { listModels, loadModel, unloadModel, getSystemStatus, getKnowledgeBases, listPromptTemplates, listRoles, selectFolder, streamCognitiveLogs, getSystemMetrics, saveFileContent } from '../../services/mindshardService';
import { ApiKeyContext, InspectionContext, RoleContext, EditorContext } from '../../App';
import useLocalStorage from '../../hooks/useLocalStorage';
import { PaperAirplaneIcon, ClipboardDocumentCheckIcon, FolderIcon, BrainCircuitIcon, WrenchScrewdriverIcon, Cog6ToothIcon, BookOpenIcon, ChartBarIcon, ClipboardIcon, RectangleStackIcon, UsersIcon, PencilIcon } from '../Icons';
import FrameBox from '../FrameBox';
import KnowledgePanel from './KnowledgePanel';
import SystemMonitorPanel from './SystemMonitorPanel';
import PromptManagerPanel from './PromptManagerPanel';
import WorkflowView from './WorkflowView';
import RolePanel from './RolePanel';

// --- Helper component for the Thought Stream tab ---
const ThoughtStreamPanel: React.FC<{ streamEntries: StreamEntry[] }> = ({ streamEntries }) => {
    const thoughts = streamEntries.filter((entry): entry is Extract<StreamEntry, { type: 'thought' }> => entry.type === 'thought');
    
    return (
        <div className="p-4 flex flex-col h-full">
            <h2 className="text-xl font-bold text-gray-300 border-b border-gray-700 pb-2 mb-4 flex-shrink-0">Thoughts</h2>
            <div className="flex flex-col h-full">
                <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                    {thoughts.map((entry) => (
                        <div key={entry.id} className="bg-gray-700/50 p-3 rounded-lg animate-fade-in">
                            <div className="flex items-start space-x-2">
                                <BrainCircuitIcon className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                                <p className="text-gray-300 text-sm">{entry.text}</p>
                            </div>
                        </div>
                    ))}
                    {thoughts.length === 0 && (
                        <div className="text-center text-gray-500 text-sm pt-4">Thoughts from the AI will appear here as it works.</div>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- Helper component for the Scratchpads tab ---
const ScratchpadsPanel: React.FC<{ streamEntries: StreamEntry[] }> = ({ streamEntries }) => {
    const scratchpads = streamEntries.filter(
        (entry): entry is Extract<StreamEntry, { type: 'full_scratchpad' }> => entry.type === 'full_scratchpad'
    );
    
    return (
        <div className="p-4 flex flex-col h-full">
             <h2 className="text-xl font-bold text-gray-300 border-b border-gray-700 pb-2 mb-4 flex-shrink-0">Scratchpads</h2>
            <div className="flex flex-col h-full">
                <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                    {scratchpads.map((entry) => (
                        <div key={entry.id} className="bg-gray-700/50 p-3 rounded-lg animate-fade-in border border-gray-600">
                            <div className="flex items-start space-x-2">
                                <BrainCircuitIcon className="w-4 h-4 text-gray-400 mt-1 flex-shrink-0" />
                                <p className="text-gray-300 text-sm font-semibold">{entry.scratchpad.thought}</p>
                            </div>
                            <div className="mt-2 pt-2 border-t border-gray-600/50">
                                {entry.scratchpad.action === 'tool_call' && entry.scratchpad.tool_payload && (
                                    <div className="text-sm">
                                        <span className="font-bold text-cyan-400">Action: </span>
                                        <span className="font-mono text-cyan-300">{entry.scratchpad.tool_payload.name}</span>
                                        <pre className="bg-gray-900/70 p-2 mt-1 rounded-md text-xs font-mono text-gray-300 overflow-x-auto">
                                            {JSON.stringify(entry.scratchpad.tool_payload.args, null, 2)}
                                        </pre>
                                    </div>
                                )}
                                {entry.scratchpad.action === 'final_answer' && (
                                    <div>
                                        <span className="font-bold text-green-400">Action: </span>
                                        <span>Final Answer</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {scratchpads.length === 0 && (
                        <div className="text-center text-gray-500 text-sm pt-4">Scratchpads will appear here as the AI works.</div>
                    )}
                </div>
            </div>
        </div>
    );
};


// --- The new Auxiliary Panel with multiple tabs ---
interface AuxiliaryPanelProps {
    streamEntries: StreamEntry[];
}
interface PanelTab {
    type: string;
    icon: React.ReactNode;
    name: string;
}
const AuxiliaryPanel: React.FC<AuxiliaryPanelProps> = ({ streamEntries }) => {
    const navRef = useRef<HTMLDivElement>(null);
    const [showLeftShadow, setShowLeftShadow] = useState(false);
    const [showRightShadow, setShowRightShadow] = useState(false);
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    const initialTabs: PanelTab[] = [
        { type: 'ThoughtStream', icon: <BrainCircuitIcon className="h-5 w-5" />, name: 'Thoughts' },
        { type: 'Scratchpads', icon: <PencilIcon className="h-5 w-5" />, name: 'Scratchpads' },
        { type: 'Workflow', icon: <RectangleStackIcon className="h-5 w-5" />, name: 'Workflow' },
        { type: 'Roles', icon: <UsersIcon className="h-5 w-5" />, name: 'Roles' },
        { type: 'Prompts', icon: <ClipboardIcon className="h-5 w-5" />, name: 'Prompts' },
        { type: 'Knowledge', icon: <BookOpenIcon className="h-5 w-5" />, name: 'Library of KBs' },
        { type: 'Monitor', icon: <ChartBarIcon className="h-5 w-5" />, name: 'Monitor' },
    ];
    
    const [panelTabs, setPanelTabs] = useState<PanelTab[]>(initialTabs);
    const [activePanel, setActivePanel] = useState<string>('ThoughtStream');

    const handleScroll = useCallback(() => {
        const nav = navRef.current;
        if (nav) {
            const { scrollLeft, scrollWidth, clientWidth } = nav;
            const PADDING = 1;
            setShowLeftShadow(scrollLeft > PADDING);
            setShowRightShadow(scrollLeft < scrollWidth - clientWidth - PADDING);
        }
    }, []);

    useEffect(() => {
        const nav = navRef.current;
        if (nav) {
            handleScroll();
            nav.addEventListener('scroll', handleScroll, { passive: true });
            const resizeObserver = new ResizeObserver(handleScroll);
            resizeObserver.observe(nav);
            return () => {
                nav.removeEventListener('scroll', handleScroll);
                resizeObserver.unobserve(nav);
            };
        }
    }, [handleScroll]);

    const handleDrop = () => {
        const newTabs = [...panelTabs];
        if (dragItem.current !== null && dragOverItem.current !== null) {
            const draggedItemContent = newTabs.splice(dragItem.current, 1)[0];
            newTabs.splice(dragOverItem.current, 0, draggedItemContent);
        }
        dragItem.current = null;
        dragOverItem.current = null;
        setPanelTabs(newTabs);
    };
    
    const renderActivePanel = useCallback(() => {
        switch (activePanel) {
            case 'ThoughtStream': return <ThoughtStreamPanel streamEntries={streamEntries} />;
            case 'Scratchpads': return <ScratchpadsPanel streamEntries={streamEntries} />;
            case 'Workflow': return <WorkflowView />;
            case 'Roles': return <RolePanel />;
            case 'Prompts': return <PromptManagerPanel />;
            case 'Knowledge': return <KnowledgePanel />;
            case 'Monitor': return <SystemMonitorPanel />;
            default: return <ThoughtStreamPanel streamEntries={streamEntries} />;
        }
    }, [activePanel, streamEntries]);

    return (
        <div className="flex flex-col h-full bg-gray-800 text-gray-200 font-sans">
            <div className="border-b border-gray-700 relative">
              <div ref={navRef} className="overflow-x-auto">
                <nav className="flex space-x-1" aria-label="Tabs" onDragOver={(e) => e.preventDefault()}>
                  {panelTabs.map((tab, index) => (
                    <button
                      key={tab.type}
                      onClick={() => setActivePanel(tab.type)}
                      title={tab.name}
                      draggable
                      onDragStart={() => dragItem.current = index}
                      onDragEnter={() => dragOverItem.current = index}
                      onDragEnd={handleDrop}
                      onDragOver={(e) => e.preventDefault()}
                      className={`
                        ${activePanel === tab.type ? 'border-cyan-400 text-cyan-400 bg-gray-900/50' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'}
                        flex-shrink-0 flex items-center justify-center whitespace-nowrap py-3 px-4 border-b-2 font-medium text-sm transition-colors duration-200
                      `}
                    >
                      {tab.icon}
                      <span className="ml-2">{tab.name}</span>
                    </button>
                  ))}
                </nav>
              </div>
              <div className={`absolute top-0 bottom-0 left-0 w-8 bg-gradient-to-r from-gray-800 to-transparent pointer-events-none transition-opacity duration-300 ${showLeftShadow ? 'opacity-100' : 'opacity-0'}`} />
              <div className={`absolute top-0 bottom-0 right-0 w-8 bg-gradient-to-l from-gray-800 to-transparent pointer-events-none transition-opacity duration-300 ${showRightShadow ? 'opacity-100' : 'opacity-0'}`} />
            </div>
            <div className="flex-1 overflow-hidden">
              {renderActivePanel()}
            </div>
        </div>
    );
};


const CodeBlock: React.FC<{ language: string; content: string }> = ({ language, content }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="bg-gray-900/80 rounded-lg my-2 border border-gray-600 overflow-hidden">
            <div className="flex justify-between items-center px-4 py-1 bg-gray-800 text-xs text-gray-400">
                <span>{language}</span>
                <button onClick={handleCopy} className="flex items-center space-x-1">
                    <ClipboardDocumentCheckIcon className="h-4 w-4" />
                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
            </div>
            <div className="h-64">
                 <Editor
                    height="100%"
                    language={language}
                    theme="vs-dark"
                    value={content}
                    options={{
                        minimap: { enabled: false },
                        fontSize: 14,
                        readOnly: true,
                        wordWrap: 'on',
                        lineNumbers: 'off',
                        scrollBeyondLastLine: false,
                    }}
                 />
            </div>
        </div>
    );
};

const parseMessageText = (text: string): { type: 'text' | 'code'; content: string; language?: string }[] => {
    const parts = text.split(/(```[\w\s]*\n[\s\S]*?\n```)/g);
    return parts.filter(part => part.trim()).map(part => {
        const match = part.match(/```([\w\s]*)\n([\s\S]*?)\n```/);
        if (match) {
            return { type: 'code', language: match[1].trim().toLowerCase() || 'plaintext', content: match[2].trim() };
        } else {
            return { type: 'text', content: part };
        }
    });
};

const SliderControl: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
}> = ({ label, value, min, max, step, onChange, disabled=false, className='' }) => {
  return (
    <div className={`grid grid-cols-6 items-center gap-4 ${className}`}>
      <label className={`text-sm col-span-2 whitespace-nowrap ${disabled ? 'text-gray-500' : 'text-gray-400'}`}>{label}:</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        className="col-span-3 h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer disabled:bg-gray-700"
      />
      <span className={`text-sm font-mono text-center py-1 rounded-md col-span-1 ${disabled ? 'bg-gray-800 text-gray-500' : 'bg-gray-900'}`}>
        {value}
      </span>
    </div>
  );
};

const ResourceMetric: React.FC<{ label: string; value: number | undefined }> = ({ label, value }) => {
    if (value === undefined) return null;

    const getStatusColor = (val: number) => {
        if (val > 85) return 'bg-red-500';
        if (val > 60) return 'bg-yellow-400';
        return 'bg-green-500';
    };

    return (
        <div className="flex items-center space-x-2" title={`${label} Usage: ${value.toFixed(0)}%`}>
            <div className={`w-2 h-2 rounded-full ${getStatusColor(value)}`}></div>
            <span className="text-xs text-gray-400 font-medium">{label}:</span>
            <span className="text-xs font-mono font-bold text-gray-200 w-8 text-right">{value.toFixed(0)}%</span>
        </div>
    );
};


const InferencePanel: React.FC = () => {
  type Tab = 'Chat' | 'Settings';
  const [activeTab, setActiveTab] = useState<Tab>('Chat');
  
  // Chat State
  const [streamEntries, setStreamEntries] = useLocalStorage<StreamEntry[]>('mindshard-stream-history', []);
  const [prompt, setPrompt] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  // Settings State
  const [localApiKey, setLocalApiKey] = useLocalStorage('mindshard-api-key', '');
  const [modelSource, setModelSource] = useLocalStorage<'online' | 'local'>('mindshard-model-source', 'online');
  const [modelFolder, setModelFolder] = useLocalStorage('mindshard-model-folder', '/path/to/models');
  const [selectedModel, setSelectedModel] = useLocalStorage('mindshard-selected-model', '');
  const [temperature, setTemperature] = useLocalStorage('mindshard-temp', 0.7);
  const [topK, setTopK] = useLocalStorage('mindshard-topk', 40);
  const [maxTokens, setMaxTokens] = useLocalStorage('mindshard-maxtokens', 1024);
  const [streamResponses, setStreamResponses] = useLocalStorage('mindshard-stream', false);
  const [useRag, setUseRag] = useLocalStorage('mindshard-userag', true);
  const [ragKbId, setRagKbId] = useLocalStorage<string | null>('mindshard-rag-kbid', null);
  const [chunkSize, setChunkSize] = useLocalStorage('mindshard-chunksize', 512);
  const [chunkOverlap, setChunkOverlap] = useLocalStorage('mindshard-overlap', 128);
  const [systemPrompt, setSystemPrompt] = useLocalStorage('mindshard-system-prompt', '');
  const [useCustomTemplate, setUseCustomTemplate] = useLocalStorage('mindshard-use-template', false);
  const [customTemplateId, setCustomTemplateId] = useLocalStorage<string | null>('mindshard-template-id', null);
  const [showDefaultSaved, setShowDefaultSaved] = useState(false);


  // Data for Settings Dropdowns
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [allKnowledgeBases, setAllKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);
  
  // System Status State
  const [status, setStatus] = useState<SystemStatus>({ model_status: 'unloaded', retriever_status: 'inactive' });
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  
  // Contexts
  const { apiKey, setApiKey } = useContext(ApiKeyContext);
  const { setInspectionData } = useContext(InspectionContext);
  const { roles, setRoles, activeRole, setActiveRole } = useContext(RoleContext);
  const { setOpenTabs } = useContext(EditorContext);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const roleIsActive = !!activeRole;

  const onlineModels = useMemo(() => availableModels.filter(m => !m.endsWith('.gguf') && !m.endsWith('.bin')), [availableModels]);
  const localModels = useMemo(() => availableModels.filter(m => m.endsWith('.gguf') || m.endsWith('.bin')), [availableModels]);

  useEffect(() => {
    const currentModels = modelSource === 'online' ? onlineModels : localModels;
    if (currentModels.length > 0) {
        const isSelectedModelInList = currentModels.includes(selectedModel);
        if (!isSelectedModelInList) {
            setSelectedModel(currentModels[0]);
        }
    }
  }, [modelSource, onlineModels, localModels, selectedModel, setSelectedModel]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [streamEntries, activeTab]);
  
  useEffect(() => {
    setApiKey(localApiKey);
  }, [localApiKey, setApiKey]);

  useEffect(() => {
    if (!apiKey) return;

    getSystemMetrics(apiKey).then(setMetrics).catch(console.error);
    const metricsInterval = setInterval(() => getSystemMetrics(apiKey).then(setMetrics), 2000);

    const folderToUse = modelSource === 'local' ? modelFolder : undefined;
    listModels(apiKey, folderToUse).then(models => {
        setAvailableModels(models);
        if (models.length > 0 && !selectedModel) setSelectedModel(models[0]);
    });
    
    if (modelSource === 'online') {
        getKnowledgeBases(apiKey).then(kbs => {
            setAllKnowledgeBases(kbs);
            if (kbs.length > 0 && !ragKbId) setRagKbId(kbs[0].id);
        });
        listPromptTemplates(apiKey).then(setPromptTemplates);
        listRoles(apiKey).then(setRoles);

        const statusInterval = setInterval(() => getSystemStatus(apiKey).then(setStatus), 5000);
        getSystemStatus(apiKey).then(setStatus); // Initial fetch
        
        return () => {
          clearInterval(statusInterval);
          clearInterval(metricsInterval);
        }
    }
    
    return () => {
      clearInterval(metricsInterval);
    }
  }, [apiKey, modelSource, modelFolder, selectedModel, ragKbId, setRoles]);

  useEffect(() => {
    // Set default active role if none is set
    if (roles.length > 0 && !activeRole) {
      const defaultRole = roles.find(r => r.id === 'role_default_agent');
      if (defaultRole) {
        setActiveRole(defaultRole);
      }
    }
  }, [roles, activeRole, setActiveRole]);
  
  const handleModelAction = async (action: 'load' | 'unload') => {
    if ((!apiKey && modelSource === 'online') || (action === 'load' && !selectedModel)) return;
    setIsBusy(true);
    const actionFunc = action === 'load' ? loadModel(apiKey, selectedModel) : unloadModel(apiKey);
    actionFunc.then(newStatus => {
        setStatus(newStatus);
        if(action === 'unload') {
            setStreamEntries([]);
            setInspectionData(null);
        }
    }).finally(() => setIsBusy(false));
  };

  const handleSetAsDefault = () => {
    // Since useLocalStorage saves automatically, all we need to do is provide feedback.
    setShowDefaultSaved(true);
    setTimeout(() => {
      setShowDefaultSaved(false);
    }, 3000);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isBusy || status.model_status !== 'loaded') return;

    const userMessage: StreamEntry = { id: `msg-${Date.now()}`, type: 'user', text: prompt };
    setStreamEntries(prev => [...prev, userMessage]);
    setPrompt('');
    setIsBusy(true);
    
    streamCognitiveLogs(
        apiKey,
        userMessage.text,
        (scratchpad: Scratchpad) => {
            const newEntries: StreamEntry[] = [];
            const now = Date.now();
            
            // New entry for the "Scratchpads" tab
            newEntries.push({
                id: `msg-${now}-fs`,
                type: 'full_scratchpad',
                scratchpad: scratchpad,
            });

            // Entry for the "Thoughts" tab
            newEntries.push({
                id: `msg-${now}-th`,
                type: 'thought',
                text: scratchpad.thought,
            });
            
            if (scratchpad.action === 'tool_call') {
                newEntries.push({
                    id: `msg-${now}-tc`,
                    type: 'tool_call',
                    tool_name: scratchpad.tool_payload!.name,
                    tool_args: scratchpad.tool_payload!.args,
                });
            } else if (scratchpad.action === 'final_answer') {
                newEntries.push({
                    id: `msg-${now}-fa`,
                    type: 'final_answer',
                    text: scratchpad.tool_payload?.args.text || "I have completed the task.",
                });
            }

            setStreamEntries(prev => [...prev, ...newEntries]);

            // Side effect for file editing
            if (scratchpad.action === 'tool_call' && scratchpad.tool_payload?.name === 'edit_file') {
                const { path, content } = scratchpad.tool_payload.args;
                saveFileContent(path, content);
                setOpenTabs(prevTabs => 
                    prevTabs.map(tab => 
                        tab.path === path 
                        ? { ...tab, content: content, isDirty: true }
                        : tab
                    )
                );
            }
        },
        () => {
            setIsBusy(false);
        }
    );
  };

  const handleSelectFolder = async () => {
    const result = await selectFolder();
    if (result && result.path) {
        setModelFolder(result.path);
    }
  };

  const SettingsView = () => (
    <div className="p-4 space-y-8 overflow-y-auto">
        <h2 className="text-xl font-bold text-gray-300 border-b border-gray-700 pb-2">Inference › Settings</h2>

        {/* Model Selection & Auth */}
        <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
            <h3 className="font-semibold text-cyan-400 mb-4">Model & Authentication</h3>
            
             <div className="flex space-x-1 rounded-lg bg-gray-700 p-1 mb-4">
                <button 
                    onClick={() => setModelSource('online')} 
                    className={`w-full rounded-md py-1.5 text-sm font-medium transition ${modelSource === 'online' ? 'bg-cyan-500 text-white shadow' : 'text-gray-300 hover:bg-gray-600/50'}`}
                >
                    Online
                </button>
                <button 
                    onClick={() => setModelSource('local')} 
                    className={`w-full rounded-md py-1.5 text-sm font-medium transition ${modelSource === 'local' ? 'bg-cyan-500 text-white shadow' : 'text-gray-300 hover:bg-gray-600/50'}`}
                >
                    Local
                </button>
            </div>

            <div className="space-y-4">
                 {modelSource === 'online' && (
                    <div className="flex items-center w-full">
                        <label htmlFor="api-key" className="text-sm font-medium text-gray-400 mr-2 whitespace-nowrap">API Key:</label>
                        <input id="api-key" type="password" value={localApiKey} onChange={(e) => setLocalApiKey(e.target.value)} placeholder="Enter your backend API key" className="w-full bg-gray-700 text-gray-300 px-3 py-1.5 border border-gray-600 rounded-md text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition"/>
                    </div>
                 )}
                <div>
                    <div className="flex items-center space-x-4">
                        {modelSource === 'local' && (
                            <button
                                onClick={handleSelectFolder}
                                className="p-2 bg-gray-700 hover:bg-gray-600 rounded-md transition flex-shrink-0"
                                title="Select Models Folder"
                            >
                                <FolderIcon className="h-5 w-5 text-gray-300" />
                            </button>
                        )}
                        <div className="flex-grow min-w-0">
                            <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)} className="bg-gray-700 p-2 rounded text-sm w-full">
                                {(modelSource === 'online' ? onlineModels : localModels).length > 0 ?
                                    (modelSource === 'online' ? onlineModels : localModels).map(m => <option key={m} value={m}>{m}</option>)
                                    : <option disabled>{`No ${modelSource} models found`}</option>
                                }
                            </select>
                        </div>
                        <button onClick={() => {
                            const folderToUse = modelSource === 'local' ? modelFolder : undefined;
                            listModels(apiKey, folderToUse).then(setAvailableModels);
                        }} className="text-sm bg-gray-600 hover:bg-gray-500 px-3 py-2 rounded transition whitespace-nowrap">Refresh Models</button>
                    </div>
                     {modelSource === 'local' && (
                        <p className="text-xs text-gray-400 mt-2 truncate pl-1" title={modelFolder}>
                           <span className="font-semibold">Current folder:</span> {modelFolder}
                        </p>
                    )}
                </div>

                <div className="flex items-center space-x-4 pt-2">
                    {status.model_status !== 'loaded' ? (
                        <button onClick={() => handleModelAction('load')} disabled={isBusy || !selectedModel} className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded disabled:bg-gray-600 text-sm">{status.model_status === 'loading' ? 'Loading...' : 'Load Model'}</button>
                    ) : (
                        <button onClick={() => handleModelAction('unload')} disabled={isBusy} className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded disabled:bg-gray-600 text-sm">Unload Model</button>
                    )}
                    <div className="text-sm text-gray-400">Status: <span className={status.model_status === 'loaded' ? 'text-green-400' : 'text-red-400'}>{status.model_status}</span></div>
                </div>
            </div>
        </div>

        {/* Parameters */}
        <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
            <h3 className="font-semibold text-cyan-400 mb-4">Parameters</h3>
            <div className="space-y-4">
                <SliderControl label="Temperature" value={temperature} min={0} max={2} step={0.1} onChange={setTemperature} />
                <SliderControl label="Top-K" value={topK} min={1} max={100} step={1} onChange={setTopK} />
                <SliderControl label="Max Tokens" value={maxTokens} min={256} max={8192} step={256} onChange={setMaxTokens} />
                <label className="flex items-center text-sm space-x-2 cursor-pointer pt-2"><input type="checkbox" checked={streamResponses} onChange={e => setStreamResponses(e.target.checked)} className="rounded bg-gray-700 border-gray-600 text-cyan-500 focus:ring-cyan-500" /> <span>Stream Responses</span></label>
            </div>
        </div>
        
        {/* RAG */}
        <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
            <h3 className="font-semibold text-cyan-400 mb-4">RAG / Knowledge</h3>
             {roleIsActive && <div className="text-xs text-yellow-400 bg-yellow-900/50 p-2 rounded-md mb-3">RAG settings are controlled by the active role: <span className="font-bold">{activeRole.name}</span>.</div>}
            <div className="space-y-4">
                 <label className="flex items-center text-sm space-x-2 cursor-pointer"><input type="checkbox" checked={roleIsActive ? activeRole.knowledge_bases.length > 0 : useRag} onChange={e => setUseRag(e.target.checked)} disabled={roleIsActive} className="rounded bg-gray-700 border-gray-600 text-cyan-500 focus:ring-cyan-500 disabled:bg-gray-800 disabled:border-gray-700" /> <span className={roleIsActive ? 'text-gray-500' : ''}>Enable RAG lookup</span></label>
                 <div className="grid grid-cols-1 gap-4">
                    <div>
                        <label className={`block text-sm mb-1 ${roleIsActive ? 'text-gray-500' : 'text-gray-400'}`}>Knowledge Base(s):</label>
                        {roleIsActive ? (
                            <div className="bg-gray-800 p-2 rounded space-y-1">
                                {activeRole.knowledge_bases.length > 0 ? activeRole.knowledge_bases.map(kbId => <div key={kbId} className="text-sm text-gray-300">{allKnowledgeBases.find(kb => kb.id === kbId)?.name || kbId}</div>) : <div className="text-sm text-gray-500">No KBs in this role.</div>}
                            </div>
                        ) : (
                            <select value={ragKbId ?? ''} onChange={e => setRagKbId(e.target.value)} className="bg-gray-700 p-2 rounded text-sm w-full">
                                {allKnowledgeBases.map(kb => <option key={kb.id} value={kb.id}>{kb.name}</option>)}
                            </select>
                        )}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                         <div>
                            <label className="block text-sm text-gray-400 mb-1">Chunk Size:</label>
                            <input type="number" value={chunkSize} onChange={e => setChunkSize(parseInt(e.target.value))} className="bg-gray-700 p-2 rounded text-sm w-full" />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Overlap:</label>
                            <input type="number" value={chunkOverlap} onChange={e => setChunkOverlap(parseInt(e.target.value))} className="bg-gray-700 p-2 rounded text-sm w-full" />
                        </div>
                    </div>
                 </div>
            </div>
        </div>

        {/* Advanced */}
         <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
            <h3 className="font-semibold text-cyan-400 mb-4">Advanced</h3>
            {roleIsActive && <div className="text-xs text-yellow-400 bg-yellow-900/50 p-2 rounded-md mb-3">System Prompt is controlled by the active role.</div>}
            <div className="space-y-4">
                 <div>
                    <label className={`block text-sm mb-1 ${roleIsActive ? 'text-gray-500' : 'text-gray-400'}`}>System Prompt:</label>
                    <textarea value={roleIsActive ? activeRole.system_prompt : systemPrompt} onChange={e => setSystemPrompt(e.target.value)} disabled={roleIsActive} rows={4} className="w-full bg-gray-700 p-2 rounded text-sm disabled:bg-gray-800 disabled:text-gray-500" />
                 </div>
                 <label className="flex items-center text-sm space-x-2 cursor-pointer"><input type="checkbox" checked={useCustomTemplate} onChange={e => setUseCustomTemplate(e.target.checked)} className="rounded bg-gray-700 border-gray-600 text-cyan-500 focus:ring-cyan-500" /> <span>Use custom prompt template</span></label>
                 {useCustomTemplate && (
                    <select value={customTemplateId ?? ''} onChange={e => setCustomTemplateId(e.target.value)} className="bg-gray-700 p-2 rounded text-sm w-full">
                        {promptTemplates.map(pt => <option key={pt.id} value={pt.id}>{pt.title}</option>)}
                    </select>
                 )}
                <button className="text-sm bg-gray-600 hover:bg-gray-500 px-3 py-2 rounded transition">Show raw JSON request/response</button>
            </div>
        </div>
        
        <div className="mt-6 pt-6 border-t border-gray-700">
            <div className="flex flex-col items-center">
                <button onClick={handleSetAsDefault} className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-6 rounded-lg transition text-base shadow-md hover:shadow-lg">
                    Save Current Settings as Default
                </button>
                {showDefaultSaved && (
                    <div className="text-sm text-green-400 mt-3 transition-opacity duration-300">
                        ✓ All current settings have been saved as your default.
                    </div>
                )}
            </div>
        </div>
    </div>
  );
  
  const ConsciousStreamView = () => (
    <div className="h-full flex flex-col">
        <div className="flex-1 flex overflow-hidden bg-gray-900">
            {/* Left Column: Main Chat */}
            <div className="w-3/4 h-full flex flex-col border-r border-gray-700">
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {streamEntries.length === 0 && <div className="text-center text-gray-500 pt-8">{status.model_status === 'unloaded' ? 'Model not loaded. Please load a model in the Settings tab to begin.' : 'Send a message to start the conversation.'}</div>}
                    
                    {streamEntries.map((entry) => {
                      switch (entry.type) {
                          case 'user':
                              return (
                                  <div key={entry.id} className="flex justify-end">
                                      <div className="max-w-xl p-3 rounded-lg bg-cyan-600 text-white">{entry.text}</div>
                                  </div>
                              );
                          case 'tool_call':
                              return (
                                   <div key={entry.id} className="flex justify-start my-3">
                                      <div className="max-w-xl p-3 rounded-lg bg-gray-700/60 border border-gray-600 w-full">
                                          <div className="flex items-center space-x-2 mb-2 text-sm">
                                              <WrenchScrewdriverIcon className="w-5 h-5 text-cyan-400" />
                                              <span className="font-bold text-gray-300">Tool Call:</span>
                                              <span className="font-mono text-cyan-300">{entry.tool_name}</span>
                                          </div>
                                          <pre className="bg-gray-900/70 p-2 rounded-md text-xs font-mono text-gray-300 overflow-x-auto">
                                              {JSON.stringify(entry.tool_args, null, 2)}
                                          </pre>
                                      </div>
                                   </div>
                              );
                          case 'final_answer':
                              const parsedParts = parseMessageText(entry.text);
                              return (
                                  <div key={entry.id} className="flex justify-start">
                                       <div className="max-w-xl p-3 rounded-lg bg-gray-700">
                                          {parsedParts.map((part, i) => part.type === 'code' ? <CodeBlock key={i} language={part.language!} content={part.content} /> : <p key={i} className="whitespace-pre-wrap">{part.content}</p>)}
                                       </div>
                                  </div>
                              );
                          case 'error':
                              return (
                                  <div key={entry.id} className="flex justify-center">
                                      <div className="w-full bg-red-800/30 p-3 my-2 rounded-lg border border-red-500/50 text-red-300">{entry.text}</div>
                                  </div>
                              );
                          default:
                              return null;
                      }
                    })}
                    <div ref={chatEndRef} />
                </div>
                <form onSubmit={handleSubmit} className="p-2 border-t border-gray-700 flex items-center space-x-2">
                    <textarea value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }} placeholder="Type your message here..." rows={2} disabled={isBusy || status.model_status !== 'loaded'} className="flex-grow bg-gray-700 p-2 rounded disabled:bg-gray-800" />
                    <button type="submit" disabled={isBusy || status.model_status !== 'loaded'} className="bg-cyan-500 p-3 rounded-lg disabled:bg-gray-600"><PaperAirplaneIcon className="h-6 w-6" /></button>
                </form>
            </div>

            {/* Right Column: New Auxiliary Panel */}
            <div className="w-1/4 h-full">
                <AuxiliaryPanel streamEntries={streamEntries} />
            </div>
        </div>
    </div>
  );

  const tabs: { name: Tab; icon: React.ReactNode; disabled?: boolean }[] = [
    { name: 'Chat', icon: <PaperAirplaneIcon className="h-5 w-5" /> },
  ];

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-lg flex flex-col h-full">
      <header
        className="flex items-center justify-between p-3 border-b border-gray-700 bg-gray-800/80 rounded-t-lg"
      >
        <div className="flex items-center space-x-3 flex-grow min-w-0">
          <h3 className="font-semibold text-gray-200 truncate">AI Assistant</h3>
        </div>
        {metrics && (
            <div className="flex flex-wrap items-center justify-end space-x-3 ml-4">
                <div className="flex items-center space-x-2 p-1.5 rounded-md bg-gray-900/50 border border-gray-700/50">
                    <ResourceMetric label="CPU" value={metrics.cpu_usage} />
                    <div className="w-px h-4 bg-gray-600" />
                    <ResourceMetric label="RAM" value={metrics.memory_usage} />
                </div>
                {(metrics.gpu_usage !== undefined || metrics.vram_usage !== undefined) && (
                    <div className="flex items-center space-x-2 p-1.5 rounded-md bg-gray-900/50 border border-gray-700/50">
                        <ResourceMetric label="GPU" value={metrics.gpu_usage} />
                        <div className="w-px h-4 bg-gray-600" />
                        <ResourceMetric label="VRAM" value={metrics.vram_usage} />
                    </div>
                )}
            </div>
        )}
      </header>
        <div className="flex flex-col h-full">
            <div className="flex-shrink-0 border-b border-gray-700 flex justify-between items-center pr-2">
                <nav className="flex space-x-1" aria-label="Tabs">
                    {tabs.map(tab => (
                        <button
                            key={tab.name}
                            onClick={() => !tab.disabled && setActiveTab(tab.name)}
                            disabled={tab.disabled}
                            className={`flex items-center space-x-2 py-3 px-4 text-sm font-medium border-b-2 transition-colors disabled:cursor-not-allowed disabled:text-gray-600
                                ${activeTab === tab.name ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-gray-400 hover:text-white'}`
                            }
                        >
                            {tab.icon}
                            <span>{tab.name}</span>
                        </button>
                    ))}
                </nav>
                <button
                    key="Settings"
                    onClick={() => setActiveTab('Settings')}
                    title="Settings"
                    className={`p-2 rounded-md transition-colors 
                        ${activeTab === 'Settings' ? 'text-cyan-400 bg-gray-700/50' : 'text-gray-400 hover:text-white hover:bg-gray-700/50'}`
                    }
                >
                    <Cog6ToothIcon className="h-5 w-5" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto">
                {activeTab === 'Chat' && <ConsciousStreamView />}
                {activeTab === 'Settings' && <SettingsView />}
            </div>
        </div>
    </div>
  );
};

export default InferencePanel;
