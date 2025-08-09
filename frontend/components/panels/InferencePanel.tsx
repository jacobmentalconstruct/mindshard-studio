
import React, { useState, useEffect, useContext, useCallback, useRef, useMemo } from 'react';
import { Editor } from "@monaco-editor/react";
import { SystemStatus, KnowledgeBase, PromptTemplate, Role, StreamEntry, Scratchpad, SystemMetrics, ContextSelection } from '../../types';
import { streamCognitiveLogs, saveFileContent } from '../../services/mindshardService';
import { useAppStore } from '../../stores/appStore';
import { InspectionContext, EditorContext } from '../../App';
import useTauriStore from '../../hooks/useTauriStore';
import { useNotify } from '../../hooks/useNotify';
import { useRolesQuery, usePromptTemplatesQuery, useKnowledgeBasesQuery, useSystemStatusQuery, useSystemMetricsQuery } from '../../hooks/queries';
import { PaperAirplaneIcon, ClipboardDocumentCheckIcon, BrainCircuitIcon, WrenchScrewdriverIcon, Cog6ToothIcon, BookOpenIcon, ChartBarIcon, ClipboardIcon, RectangleStackIcon, UsersIcon, PencilIcon, XCircleIcon } from '../Icons';
import KnowledgePanel from './KnowledgePanel';
import SystemMonitorPanel from './SystemMonitorPanel';
import PromptManagerPanel from './PromptManagerPanel';
import WorkflowView from './WorkflowView';
import RolePanel from './RolePanel';
import { SettingsView } from './SettingsPanel'; 
import LoadingSpinner from '../common/LoadingSpinner';
import type { ContextSelection } from '../../types';


// --- Helper component for the Thought Stream tab ---
const ThoughtStreamPanel: React.FC<{ streamEntries: StreamEntry[], isBusy: boolean }> = ({ streamEntries, isBusy }) => {
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
                    {isBusy && thoughts.length === 0 && <LoadingSpinner text="Thinking..." />}
                    {!isBusy && thoughts.length === 0 && (
                        <div className="text-center text-gray-500 text-sm pt-4">Thoughts from the AI will appear here as it works.</div>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- Helper component for the Scratchpads tab ---
const ScratchpadsPanel: React.FC<{ streamEntries: StreamEntry[], isBusy: boolean }> = ({ streamEntries, isBusy }) => {
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
                    {isBusy && scratchpads.length === 0 && <LoadingSpinner text="Working..." />}
                    {!isBusy && scratchpads.length === 0 && (
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
    isBusy: boolean;
}
interface PanelTab {
    type: string;
    icon: React.ReactNode;
    name: string;
}
const AuxiliaryPanel: React.FC<AuxiliaryPanelProps> = ({ streamEntries, isBusy }) => {
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
            case 'ThoughtStream': return <ThoughtStreamPanel streamEntries={streamEntries} isBusy={isBusy}/>;
            case 'Scratchpads': return <ScratchpadsPanel streamEntries={streamEntries} isBusy={isBusy}/>;
            case 'Workflow': return <WorkflowView />;
            case 'Roles': return <RolePanel />;
            case 'Prompts': return <PromptManagerPanel />;
            case 'Knowledge': return <KnowledgePanel />;
            case 'Monitor': return <SystemMonitorPanel />;
            default: return <ThoughtStreamPanel streamEntries={streamEntries} isBusy={isBusy}/>;
        }
    }, [activePanel, streamEntries, isBusy]);

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
    const notify = useNotify.getState();

    const handleCopy = () => {
        navigator.clipboard.writeText(content);
        setCopied(true);
        notify.success('Code copied to clipboard!');
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

const ConsciousStreamView: React.FC<{
  prompt: string;
  setPrompt: (p: string) => void;
  handleSubmit: (e: React.FormEvent) => void;
  isBusy: boolean;
  status: SystemStatus;
  streamEntries: StreamEntry[];
  chatEndRef: React.RefObject<HTMLDivElement>;
}> = ({ prompt, setPrompt, handleSubmit, isBusy, status, streamEntries, chatEndRef }) => (
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
                <AuxiliaryPanel streamEntries={streamEntries} isBusy={isBusy} />
            </div>
        </div>
    </div>
  );

const InferencePanel: React.FC = () => {
  type Tab = 'Chat' | 'Settings';
  const [activeTab, setActiveTab] = useState<Tab>('Chat');
  
  // Chat State
  const [streamEntries, setStreamEntries] = useTauriStore<StreamEntry[]>('mindshard-stream-history', []);
  const [prompt, setPrompt] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  
  const notify = useNotify.getState();

  // Settings State from useTauriStore
  const [localApiKey, setLocalApiKey] = useTauriStore('mindshard-api-key', '');
  const [modelFolder, setModelFolder] = useTauriStore('mindshard-model-folder', '/models');
  const [selectedModel, setSelectedModel] = useTauriStore('mindshard-selected-model', '');
  const [temperature, setTemperature] = useTauriStore('mindshard-temp', 0.7);
  const [topK, setTopK] = useTauriStore('mindshard-topk', 40);
  const [maxTokens, setMaxTokens] = useTauriStore('mindshard-maxtokens', 1024);
  const [streamResponses, setStreamResponses] = useTauriStore('mindshard-stream', false);
  const [useRag, setUseRag] = useTauriStore('mindshard-userag', true);
  const [ragKbId, setRagKbId] = useTauriStore<string | null>('mindshard-rag-kbid', null);
  const [chunkSize, setChunkSize] = useTauriStore('mindshard-chunksize', 512);
  const [chunkOverlap, setChunkOverlap] = useTauriStore('mindshard-overlap', 128);
  const [systemPrompt, setSystemPrompt] = useTauriStore('mindshard-system-prompt', '');
  const [useCustomTemplate, setUseCustomTemplate] = useTauriStore('mindshard-use-template', false);
  const [customTemplateId, setCustomTemplateId] = useTauriStore<string | null>('mindshard-template-id', null);

  // Zustand state
  const { apiKey, setApiKey, activeRole, roles, setRoles, setActiveRole } = useAppStore();
  
  // React-Query Data
  const { data: status, error: statusError } = useSystemStatusQuery();
  const { data: metrics, error: metricsError } = useSystemMetricsQuery();
  const { data: allKnowledgeBases = [] } = useKnowledgeBasesQuery();
  const { data: promptTemplates = [] } = usePromptTemplatesQuery();
  const { data: rolesData, isLoading: rolesLoading } = useRolesQuery();

  // Contexts
  const { setInspectionData } = useContext(InspectionContext);
  const { setOpenTabs } = useContext(EditorContext);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (statusError) notify.error(`System Status Error: ${statusError.message}`);
    if (metricsError) notify.error(`System Metrics Error: ${metricsError.message}`);
  }, [statusError, metricsError, notify]);
  
  useEffect(() => {
    if (rolesData) {
        setRoles(rolesData);
        // Set default active role if none is set
        if (rolesData.length > 0 && !activeRole) {
            const defaultRole = rolesData.find(r => r.id === 'role_default_agent') || rolesData[0];
            if (defaultRole) {
                setActiveRole(defaultRole);
            }
        }
    }
  }, [rolesData, setRoles, activeRole, setActiveRole]);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [streamEntries, activeTab]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isBusy || status?.model_status !== 'loaded') return;

    const userMessage: StreamEntry = { id: `msg-${Date.now()}`, type: 'user', text: prompt };
    setStreamEntries(prev => [...prev, userMessage]);
    setPrompt('');
    setIsBusy(true);

    const inferenceParams = {
        model: selectedModel,
        temperature: temperature,
        top_k: topK,
        max_tokens: maxTokens,
    };
    const contextSelection: ContextSelection = {
        use_rag: useRag,
		rag_knowledge_base_id: ragKbId || undefined,
    };
    const onError = (error: Error) => {
        console.error("Streaming error:", error);
        const errorMessage: StreamEntry = { id: `err-${Date.now()}`, type: 'error', text: `Streaming Error: ${error.message}` };
        setStreamEntries(prev => [...prev, errorMessage]);
        setIsBusy(false);
    };
    
    streamCognitiveLogs(
        apiKey,
        userMessage.text,
        inferenceParams,
        contextSelection,
        (scratchpad: Scratchpad) => {
            const newEntries: StreamEntry[] = [];
            const now = Date.now();
            
            newEntries.push({
                id: `msg-${now}-fs`,
                type: 'full_scratchpad',
                scratchpad: scratchpad,
            });

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

            if (scratchpad.action === 'tool_call' && scratchpad.tool_payload?.name === 'edit_file') {
                const { path, content } = scratchpad.tool_payload.args;
                saveFileContent(path, content).catch(e => console.error("Failed to save file from tool call", e));
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
        },
        onError
    );
  };
  
  const tabs: { name: Tab; icon: React.ReactNode; disabled?: boolean }[] = [
    { name: 'Chat', icon: <PaperAirplaneIcon className="h-5 w-5" /> },
  ];
  
  const settingsProps = {
    localApiKey, setLocalApiKey, modelFolder, setModelFolder, selectedModel, 
    setSelectedModel, temperature, setTemperature, topK, setTopK, maxTokens, 
    setMaxTokens, streamResponses, setStreamResponses, activeRole, useRag, setUseRag, 
    allKnowledgeBases, ragKbId, setRagKbId, chunkSize, setChunkSize, chunkOverlap, 
    setChunkOverlap, systemPrompt, setSystemPrompt, useCustomTemplate, setUseCustomTemplate, 
    promptTemplates, customTemplateId, setCustomTemplateId,
  };

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
                {activeTab === 'Chat' && <ConsciousStreamView {...{ prompt, setPrompt, handleSubmit, isBusy, status: status || { model_status: 'unloaded', retriever_status: 'inactive' }, streamEntries, chatEndRef }} />}
                {activeTab === 'Settings' && <SettingsView {...settingsProps} />}
            </div>
        </div>
    </div>
  );
};

export default InferencePanel;