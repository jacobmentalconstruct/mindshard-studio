
import React, { useState } from 'react';
import { SystemStatus, KnowledgeBase, PromptTemplate, Role } from '../../types';
import { useModelsQuery, useModelActionMutation } from '../../hooks/queries';
import { useNotify } from '../../hooks/useNotify';
import LoadingSpinner from '../common/LoadingSpinner';
import FolderPickerModal from '../common/FolderPickerModal';

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

export interface SettingsViewProps {
    localApiKey: string;
    setLocalApiKey: (key: string) => void;
    modelFolder: string;
    setModelFolder: (folder: string) => void;
    selectedModel: string;
    setSelectedModel: (model: string) => void;
    temperature: number;
    setTemperature: (temp: number) => void;
    topK: number;
    setTopK: (k: number) => void;
    maxTokens: number;
    setMaxTokens: (tokens: number) => void;
    streamResponses: boolean;
    setStreamResponses: (stream: boolean) => void;
    activeRole: Role | null;
    useRag: boolean;
    setUseRag: (use: boolean) => void;
    allKnowledgeBases: KnowledgeBase[];
    ragKbId: string | null;
    setRagKbId: (id: string | null) => void;
    chunkSize: number;
    setChunkSize: (size: number) => void;
    chunkOverlap: number;
    setChunkOverlap: (overlap: number) => void;
    systemPrompt: string;
    setSystemPrompt: (prompt: string) => void;
    useCustomTemplate: boolean;
    setUseCustomTemplate: (use: boolean) => void;
    promptTemplates: PromptTemplate[];
    customTemplateId: string | null;
    setCustomTemplateId: (id: string | null) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = (props) => {
    const {
        localApiKey, setLocalApiKey, modelFolder, setModelFolder, selectedModel, 
        setSelectedModel, temperature, setTemperature, topK, setTopK, maxTokens, 
        setMaxTokens, streamResponses, setStreamResponses, activeRole, useRag, 
        setUseRag, allKnowledgeBases, ragKbId, setRagKbId, chunkSize, setChunkSize, 
        chunkOverlap, setChunkOverlap, systemPrompt, setSystemPrompt, useCustomTemplate, 
        setUseCustomTemplate, promptTemplates, customTemplateId, setCustomTemplateId,
    } = props;
    
    const notify = useNotify.getState();
    const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false);

    const { data: availableModels = [], refetch: refreshModels, status: modelsStatus } = useModelsQuery(modelFolder);
    const { mutate: modelAction, isPending: isModelActionPending } = useModelActionMutation();

    const handleModelAction = (action: 'load' | 'unload') => {
        modelAction({ action, model: selectedModel });
    }

    const handleSetAsDefault = () => {
        // useTauriStore saves automatically on set, so we just need to provide feedback.
        notify.success('All current settings have been saved as default.');
    };

    const handleSelectFolder = (path: string) => {
        setModelFolder(path);
        setIsFolderPickerOpen(false);
    };
    
    const roleIsActive = !!activeRole;
    const modelIsLoaded = false; // This should come from system status from the store

    return (
        <>
            <FolderPickerModal
                isOpen={isFolderPickerOpen}
                onClose={() => setIsFolderPickerOpen(false)}
                onSelect={handleSelectFolder}
                initialPath={modelFolder}
            />
            <div className="p-4 space-y-8 overflow-y-auto">
                <h2 className="text-xl font-bold text-gray-300 border-b border-gray-700 pb-2">Inference › Settings</h2>

                <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                    <h3 className="font-semibold text-cyan-400 mb-4">Model & Authentication</h3>
                    <div className="space-y-4">
                        <div className="flex items-center w-full">
                            <label htmlFor="api-key" className="text-sm font-medium text-gray-400 mr-2 whitespace-nowrap">API Key:</label>
                            <input id="api-key" type="password" value={localApiKey} onChange={(e) => setLocalApiKey(e.target.value)} placeholder="Enter your backend API key" className="w-full bg-gray-700 text-gray-300 px-3 py-1.5 border border-gray-600 rounded-md text-sm"/>
                        </div>
                        <div>
                            <label htmlFor="model-folder" className="text-sm font-medium text-gray-400">Model Folder Path</label>
                            <div className="flex items-center space-x-2">
                                <input id="model-folder" type="text" value={modelFolder} onChange={(e) => setModelFolder(e.target.value)} placeholder="/models" className="w-full bg-gray-700 text-gray-300 px-3 py-1.5 border border-gray-600 rounded-md text-sm"/>
                                <button onClick={() => setIsFolderPickerOpen(true)} className="text-sm bg-gray-600 hover:bg-gray-500 px-3 py-2 rounded transition whitespace-nowrap">Browse...</button>
                            </div>
                        </div>
                        <div>
                            <div className="flex items-end space-x-4">
                                <div className="flex-grow min-w-0">
                                    <label htmlFor="model-select" className="text-sm font-medium text-gray-400 mb-1 block">Model</label>
                                    <select id="model-select" value={selectedModel} onChange={e => setSelectedModel(e.target.value)} className="bg-gray-700 p-2 rounded text-sm w-full" disabled={modelsStatus === 'pending'}>
                                        {modelsStatus === 'pending' && <option>Loading models...</option>}
                                        {modelsStatus === 'success' && (availableModels.length > 0 ?
                                            availableModels.map(m => <option key={m} value={m}>{m}</option>)
                                            : <option disabled>No models found in path</option>
                                        )}
                                        {modelsStatus === 'error' && <option disabled>Error fetching models</option>}
                                    </select>
                                </div>
                                <button onClick={() => refreshModels()} disabled={modelsStatus === 'pending'} className="text-sm bg-gray-600 hover:bg-gray-500 px-3 py-2 rounded transition whitespace-nowrap">Refresh Models</button>
                            </div>
                        </div>

                        <div className="flex items-center space-x-4 pt-2">
                            {!modelIsLoaded ? (
                                <button onClick={() => handleModelAction('load')} disabled={isModelActionPending || !selectedModel} className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded disabled:bg-gray-600 text-sm flex items-center space-x-2">
                                    {isModelActionPending && <LoadingSpinner size="sm" />}
                                    <span>{isModelActionPending ? 'Loading...' : 'Load Model'}</span>
                                </button>
                            ) : (
                                <button onClick={() => handleModelAction('unload')} disabled={isModelActionPending} className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded disabled:bg-gray-600 text-sm flex items-center space-x-2">
                                    {isModelActionPending && <LoadingSpinner size="sm" />}
                                    <span>Unload Model</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                    <h3 className="font-semibold text-cyan-400 mb-4">Parameters</h3>
                    <div className="space-y-4">
                        <SliderControl label="Temperature" value={temperature} min={0} max={2} step={0.1} onChange={setTemperature} />
                        <SliderControl label="Top-K" value={topK} min={1} max={100} step={1} onChange={setTopK} />
                        <SliderControl label="Max Tokens" value={maxTokens} min={256} max={8192} step={256} onChange={setMaxTokens} />
                        <label className="flex items-center text-sm space-x-2 cursor-pointer pt-2"><input type="checkbox" checked={streamResponses} onChange={e => setStreamResponses(e.target.checked)} className="rounded bg-gray-700 border-gray-600 text-cyan-500"/> <span>Stream Responses</span></label>
                    </div>
                </div>
                
                <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                    <h3 className="font-semibold text-cyan-400 mb-4">RAG / Knowledge</h3>
                    {roleIsActive && <div className="text-xs text-yellow-400 bg-yellow-900/50 p-2 rounded-md mb-3">RAG settings are controlled by the active role: <span className="font-bold">{activeRole?.name}</span>.</div>}
                    <div className="space-y-4">
                        <label className="flex items-center text-sm space-x-2 cursor-pointer"><input type="checkbox" checked={roleIsActive ? (activeRole?.knowledge_bases.length ?? 0) > 0 : useRag} onChange={e => setUseRag(e.target.checked)} disabled={roleIsActive} className="rounded bg-gray-700 border-gray-600 text-cyan-500 disabled:bg-gray-800"/> <span className={roleIsActive ? 'text-gray-500' : ''}>Enable RAG lookup</span></label>
                        <div className="grid grid-cols-1 gap-4">
                            <div>
                                <label className={`block text-sm mb-1 ${roleIsActive ? 'text-gray-500' : 'text-gray-400'}`}>Knowledge Base(s):</label>
                                {roleIsActive ? (
                                    <div className="bg-gray-800 p-2 rounded space-y-1">
                                        {(activeRole?.knowledge_bases.length ?? 0) > 0 ? activeRole?.knowledge_bases.map(kbId => <div key={kbId} className="text-sm text-gray-300">{allKnowledgeBases.find(kb => kb.id === kbId)?.name || kbId}</div>) : <div className="text-sm text-gray-500">No KBs in this role.</div>}
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

                <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                    <h3 className="font-semibold text-cyan-400 mb-4">Advanced</h3>
                    {roleIsActive && <div className="text-xs text-yellow-400 bg-yellow-900/50 p-2 rounded-md mb-3">System Prompt is controlled by the active role.</div>}
                    <div className="space-y-4">
                        <div>
                            <label className={`block text-sm mb-1 ${roleIsActive ? 'text-gray-500' : 'text-gray-400'}`}>System Prompt:</label>
                            <textarea value={roleIsActive ? activeRole?.system_prompt : systemPrompt} onChange={e => setSystemPrompt(e.target.value)} disabled={roleIsActive} rows={4} className="w-full bg-gray-700 p-2 rounded text-sm disabled:bg-gray-800"/>
                        </div>
                        <label className="flex items-center text-sm space-x-2 cursor-pointer"><input type="checkbox" checked={useCustomTemplate} onChange={e => setUseCustomTemplate(e.target.checked)} className="rounded bg-gray-700 border-gray-600 text-cyan-500"/> <span>Use custom prompt template</span></label>
                        {useCustomTemplate && (
                            <select value={customTemplateId ?? ''} onChange={e => setCustomTemplateId(e.target.value)} className="bg-gray-700 p-2 rounded text-sm w-full">
                                {promptTemplates.map(pt => <option key={pt.id} value={pt.id}>{pt.title}</option>)}
                            </select>
                        )}
                    </div>
                </div>
                
                <div className="mt-6 pt-6 border-t border-gray-700">
                    <div className="flex flex-col items-center">
                        <button onClick={handleSetAsDefault} className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-6 rounded-lg transition text-base shadow-md hover:shadow-lg">
                            Save Current Settings as Default
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}