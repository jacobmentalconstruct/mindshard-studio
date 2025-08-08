

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PromptTemplate } from '../../types';
import { listPromptTemplates, createPromptTemplate, updatePromptTemplate, deletePromptTemplate } from '../../services/mindshardService';
import { useAppStore } from '../../stores/appStore';
import { PlusIcon, TrashIcon } from '../Icons';
import { Editor } from "@monaco-editor/react";

const EMPTY_PROMPT_DETAILS: Omit<PromptTemplate, 'id'> = {
    title: '',
    content: '',
    tags: [],
};

const PromptManagerPanel: React.FC = () => {
    const apiKey = useAppStore(state => state.apiKey);
    const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
    const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
    const [activeDetails, setActiveDetails] = useState<Partial<PromptTemplate>>({});
    const [originalDetails, setOriginalDetails] = useState<Partial<PromptTemplate> | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    
    const isDirty = useMemo(() => {
        return JSON.stringify(activeDetails) !== JSON.stringify(originalDetails);
    }, [activeDetails, originalDetails]);

    const fetchPrompts = useCallback(() => {
        if (!apiKey) return;
        setIsLoading(true);
        listPromptTemplates(apiKey).then(setPrompts).finally(() => setIsLoading(false));
    }, [apiKey]);

    useEffect(() => {
        fetchPrompts();
    }, [fetchPrompts]);

    useEffect(() => {
        // This effect runs only once after the initial fetch to set a default
        if (prompts.length > 0 && selectedPromptId === null && originalDetails === null) {
            const defaultPrompt = prompts.find(p => p.id === 'p_default');
            if (defaultPrompt) {
                setSelectedPromptId(defaultPrompt.id);
                // Deep copy for editing state
                const promptCopy = JSON.parse(JSON.stringify(defaultPrompt));
                setActiveDetails(promptCopy);
                setOriginalDetails(promptCopy);
            }
        }
    }, [prompts, selectedPromptId, originalDetails]);

    const handleSelectPrompt = useCallback((promptId: string) => {
        if (isDirty && !window.confirm("You have unsaved changes. Are you sure you want to switch?")) return;
        
        setSelectedPromptId(promptId);
        const prompt = prompts.find(p => p.id === promptId);
        if (prompt) {
            setActiveDetails(prompt);
            setOriginalDetails(JSON.parse(JSON.stringify(prompt))); // Deep copy
        }
    }, [prompts, isDirty]);
    
    const handleNewPrompt = () => {
        if (isDirty && !window.confirm("You have unsaved changes. Are you sure you want to create a new prompt?")) return;
        
        setSelectedPromptId(null);
        const newPromptData = { ...EMPTY_PROMPT_DETAILS, title: "New Prompt" };
        setActiveDetails(newPromptData);
        setOriginalDetails(newPromptData); 
    };

    const handleInputChange = (field: keyof Omit<PromptTemplate, 'id'>, value: any) => {
        setActiveDetails(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        if (!apiKey || !activeDetails.title) return;
        setIsSaving(true);
        try {
            let savedPrompt;
            if (selectedPromptId && activeDetails.id) { // Update
                savedPrompt = await updatePromptTemplate(apiKey, activeDetails as PromptTemplate);
            } else { // Create
                savedPrompt = await createPromptTemplate(apiKey, activeDetails as Omit<PromptTemplate, 'id'>);
                setSelectedPromptId(savedPrompt.id);
            }
            setActiveDetails(savedPrompt);
            setOriginalDetails(JSON.parse(JSON.stringify(savedPrompt)));
            fetchPrompts();
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleDelete = async () => {
        if (!apiKey || !selectedPromptId || !window.confirm(`Are you sure you want to delete prompt "${activeDetails.title}"?`)) return;
        
        await deletePromptTemplate(apiKey, selectedPromptId);
        fetchPrompts();
        setSelectedPromptId(null);
        setActiveDetails({});
        setOriginalDetails(null);
    }
    
    const filteredPrompts = useMemo(() =>
        prompts.filter(prompt => prompt.title.toLowerCase().includes(searchTerm.toLowerCase())),
        [prompts, searchTerm]
    );

    return (
        <div className="flex flex-col h-full p-4 space-y-4 text-sm">
            <h2 className="text-xl font-bold text-gray-300 border-b border-gray-700 pb-2 flex-shrink-0">Prompts</h2>
            <div className="flex-1 flex space-x-4 min-h-0">
                {/* Left Panel: List */}
                <div className="w-1/3 flex flex-col border-r border-gray-700 pr-4">
                    <div className="flex space-x-2 mb-4">
                        <button onClick={handleNewPrompt} className="flex items-center justify-center space-x-2 w-full bg-cyan-500 hover:bg-cyan-600 p-2 rounded transition text-sm">
                            <PlusIcon className="h-5 w-5"/>
                            <span>New Prompt</span>
                        </button>
                    </div>
                    <input
                        type="search"
                        placeholder="Search prompts..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="bg-gray-700 p-2 rounded-md w-full mb-4 text-sm"
                    />
                    <div className="flex-1 overflow-y-auto space-y-2">
                        {isLoading && <p className="text-gray-400">Loading prompts...</p>}
                        {filteredPrompts.map(prompt => (
                            <button
                                key={prompt.id}
                                onClick={() => handleSelectPrompt(prompt.id)}
                                className={`w-full text-left p-2 rounded-md transition-colors
                                    ${selectedPromptId === prompt.id ? 'bg-cyan-500/80 text-white' : 'bg-gray-700 hover:bg-gray-600'}
                                `}
                            >
                                <span className="font-semibold">{prompt.title}</span>
                                <div className="text-xs text-gray-400 truncate">{prompt.content}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Right Panel: Details */}
                <div className="w-2/3 flex flex-col space-y-4 overflow-y-auto pr-2">
                    {originalDetails ? (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Title</label>
                                <input type="text" value={activeDetails.title || ''} onChange={e => handleInputChange('title', e.target.value)} className="w-full bg-gray-700 p-2 rounded" />
                            </div>
                            
                            <div className="flex-1 flex flex-col min-h-[200px]">
                                <label className="block text-sm font-medium text-gray-400 mb-1">Content</label>
                                <div className="flex-1 rounded-md overflow-hidden bg-gray-800 border border-gray-600">
                                    <Editor
                                        height="100%"
                                        language="markdown"
                                        theme="vs-dark"
                                        value={activeDetails.content || ''}
                                        onChange={value => handleInputChange('content', value || '')}
                                        options={{
                                            minimap: { enabled: false },
                                            fontSize: 14,
                                            wordWrap: 'on',
                                        }}
                                    />
                                </div>
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">Tags (comma-separated)</label>
                                <input type="text" value={(activeDetails.tags || []).join(', ')} onChange={e => handleInputChange('tags', e.target.value.split(/,\s*/).filter(t=>t))} className="w-full bg-gray-700 p-2 rounded" />
                            </div>
                            
                            <div className="flex space-x-4 pt-4">
                                <button onClick={handleSave} disabled={!isDirty || isSaving} className="bg-green-600 hover:bg-green-700 p-2 rounded-md flex-grow disabled:bg-gray-500">
                                    {isSaving ? 'Saving...' : 'Save Changes'}
                                    {isDirty && '*'}
                                </button>
                                {selectedPromptId && (
                                    <button onClick={handleDelete} className="bg-red-600/80 hover:bg-red-700 p-2 rounded-md flex items-center justify-center space-x-2">
                                        <TrashIcon className="h-5 w-5" />
                                        <span>Delete</span>
                                    </button>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-500">
                            Select a prompt to view details, or create a new one.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PromptManagerPanel;