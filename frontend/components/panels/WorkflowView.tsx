

import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { Workflow, WorkflowStep, Role } from '../../types';
import { getAllWorkflows, getWorkflowById, createWorkflow, updateWorkflow, deleteWorkflow, infer } from '../../services/mindshardService';
import { InspectionContext } from '../../App';
import { useAppStore } from '../../stores/appStore';
import { PlusIcon, TrashIcon, PaperAirplaneIcon, ChevronLeftIcon, ChevronRightIcon } from '../Icons';
import useTauriStore from '../../hooks/useTauriStore';
import { Editor } from "@monaco-editor/react";

const WorkflowView: React.FC = () => {
    const { apiKey, roles } = useAppStore();
    const { setInspectionData } = useContext(InspectionContext);
    const [useRag] = useTauriStore('mindshard-userag', true);

    const [workflows, setWorkflows] = useState<Workflow[]>([]);
    const [activeWorkflow, setActiveWorkflow] = useState<Workflow | null>(null);
    const [originalWorkflow, setOriginalWorkflow] = useState<Workflow | null>(null);
    const [activeStepId, setActiveStepId] = useState<string | null>(null);
    const [selectedStepIds, setSelectedStepIds] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isRunningStep, setIsRunningStep] = useState<string | null>(null);

    const isDirty = useMemo(() => {
        return JSON.stringify(activeWorkflow) !== JSON.stringify(originalWorkflow);
    }, [activeWorkflow, originalWorkflow]);

    const activeStepIndex = useMemo(() => {
        return activeWorkflow?.steps.findIndex(s => s.id === activeStepId) ?? -1;
    }, [activeWorkflow, activeStepId]);

    const fetchWorkflows = useCallback(() => {
        if (!apiKey) return;
        setIsLoading(true);
        getAllWorkflows(apiKey).then(setWorkflows).finally(() => setIsLoading(false));
    }, [apiKey]);

    useEffect(() => {
        fetchWorkflows();
    }, [fetchWorkflows]);

    const handleSelectWorkflow = useCallback(async (id: string) => {
        if (!apiKey) return;
        if (isDirty && !window.confirm("You have unsaved changes. Are you sure you want to switch?")) return;
        
        setIsLoading(true);
        const wf = await getWorkflowById(apiKey, id);
        setActiveWorkflow(wf);
        setOriginalWorkflow(JSON.parse(JSON.stringify(wf))); // Deep copy for dirty checking
        setActiveStepId(wf?.steps?.[0]?.id || null);
        setSelectedStepIds(new Set());
        setIsLoading(false);
    }, [apiKey, isDirty]);

    const handleNewWorkflow = () => {
        if (isDirty && !window.confirm("You have unsaved changes. Are you sure you want to create a new workflow?")) return;
        
        const newWf: Workflow = { id: '', name: 'Untitled Workflow', steps: [] };
        setActiveWorkflow(newWf);
        setOriginalWorkflow(null);
        setActiveStepId(null);
        setSelectedStepIds(new Set());
    };

    const handleSaveWorkflow = async () => {
        if (!apiKey || !activeWorkflow || !isDirty) return;
        setIsSaving(true);
        try {
            const workflowToSave = { ...activeWorkflow, name: activeWorkflow.name || 'Untitled Workflow' };
            let savedWf;
            if (activeWorkflow.id) {
                savedWf = await updateWorkflow(apiKey, workflowToSave);
            } else {
                const { id, ...newWfData } = workflowToSave;
                savedWf = await createWorkflow(apiKey, newWfData);
            }
            setActiveWorkflow(savedWf);
            setOriginalWorkflow(JSON.parse(JSON.stringify(savedWf)));
            fetchWorkflows(); // Refresh list
        } catch (error) {
            console.error("Failed to save workflow", error);
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleAddStep = () => {
        setActiveWorkflow(prev => {
            if (!prev) return null;
            const newStep: WorkflowStep = { id: `step-${Date.now()}`, prompt: '', response: '' };
            const updatedWf = { ...prev, steps: [...prev.steps, newStep] };
            setActiveStepId(newStep.id);
            return updatedWf;
        });
    };

    const handleDeleteSelectedSteps = () => {
        if (selectedStepIds.size === 0) return;
        setActiveWorkflow(prev => {
            if (!prev) return null;
            const newSteps = prev.steps.filter(s => !selectedStepIds.has(s.id));
            const updatedWf = { ...prev, steps: newSteps };
            
            if (activeStepId && selectedStepIds.has(activeStepId)) {
                const currentIndex = prev.steps.findIndex(s => s.id === activeStepId);
                const nextStep = newSteps[currentIndex] || newSteps[newSteps.length - 1];
                setActiveStepId(nextStep?.id || null);
            }
            setSelectedStepIds(new Set());
            return updatedWf;
        });
    };

    const handleStepChange = (stepId: string, updates: Partial<WorkflowStep>) => {
        setActiveWorkflow(prev => {
            if (!prev) return null;
            return {
                ...prev,
                steps: prev.steps.map(s => s.id === stepId ? { ...s, ...updates } : s)
            };
        });
    };
    
    const handleRunStep = async (stepId: string) => {
        if (!apiKey || !activeWorkflow) return;
        const step = activeWorkflow.steps.find(s => s.id === stepId);
        if (!step || !step.prompt) return;

        setIsRunningStep(stepId);
        try {
            const roleForStep = roles.find(r => r.id === step.roleId);
            
            const inferConfig = {
                prompt: step.prompt,
                use_rag: roleForStep ? roleForStep.knowledge_bases.length > 0 : useRag,
                system_prompt: roleForStep ? roleForStep.system_prompt : undefined,
            };

            const result = await infer(apiKey, inferConfig);
            handleStepChange(stepId, { response: result.completion });
            setInspectionData(result.inspection);
        } catch (error) {
            console.error("Failed to run step", error);
            handleStepChange(stepId, { response: `Error: Could not get response.` });
        } finally {
            setIsRunningStep(null);
        }
    };
    
    const finalOutput = activeWorkflow?.steps[activeWorkflow.steps.length - 1]?.response || '';

    return (
        <div className="flex flex-col h-full p-4 space-y-4 text-sm">
            <h2 className="text-xl font-bold text-gray-300 border-b border-gray-700 pb-2">Workflows</h2>

            <div className="flex-1 flex space-x-4 min-h-0">
                {/* Left Panel: Selector & Steps */}
                <div className="w-1/3 flex flex-col space-y-4">
                    {/* Selector Bar */}
                    <div className="flex-shrink-0 bg-gray-900/50 p-3 rounded-lg border border-gray-700 space-y-3">
                        <select
                            value={activeWorkflow?.id || ''}
                            onChange={(e) => handleSelectWorkflow(e.target.value)}
                            className="w-full bg-gray-700 p-2 rounded"
                            disabled={isLoading}
                        >
                            <option value="" disabled>Select a workflow...</option>
                            {workflows.map(wf => <option key={wf.id} value={wf.id}>{wf.name}</option>)}
                        </select>
                        <div className="flex space-x-2">
                            <button onClick={handleNewWorkflow} className="w-full bg-cyan-600 hover:bg-cyan-700 p-2 rounded transition">New</button>
                            <button onClick={handleSaveWorkflow} disabled={!isDirty || isSaving} className="w-full bg-green-600 hover:bg-green-700 p-2 rounded transition disabled:bg-gray-500 disabled:cursor-not-allowed">
                                {isSaving ? 'Saving...' : 'Save'}
                                {isDirty && '*'}
                            </button>
                        </div>
                    </div>

                    {/* Steps List */}
                    <div className="flex-1 flex flex-col min-h-0 bg-gray-900/50 p-3 rounded-lg border border-gray-700">
                        <h3 className="font-semibold text-gray-300 mb-2 flex-shrink-0">Steps</h3>
                        <div className="flex-1 overflow-y-auto pr-2 space-y-2">
                           {activeWorkflow?.steps.map((step, index) => (
                               <div key={step.id} className={`p-2 rounded-md border cursor-pointer ${activeStepId === step.id ? 'bg-cyan-500/20 border-cyan-500' : 'bg-gray-800 border-gray-700 hover:bg-gray-700'}`} onClick={() => setActiveStepId(step.id)}>
                                   <div className="flex items-center">
                                        <input type="checkbox" className="mr-3 h-4 w-4 rounded bg-gray-700 border-gray-600 text-cyan-500 focus:ring-cyan-500" checked={selectedStepIds.has(step.id)} onChange={e => {
                                            e.stopPropagation();
                                            setSelectedStepIds(prev => {
                                                const newSet = new Set(prev);
                                                if (e.target.checked) newSet.add(step.id);
                                                else newSet.delete(step.id);
                                                return newSet;
                                            });
                                        }} />
                                        <div className="flex-1 truncate">
                                            <div className="font-bold text-gray-300">Step {index + 1}</div>
                                            <div className="text-xs text-gray-400 truncate">{step.prompt || 'Empty Prompt'}</div>
                                        </div>
                                        <button disabled={isRunningStep === step.id} onClick={(e) => { e.stopPropagation(); handleRunStep(step.id); }} className="p-1 text-gray-400 hover:text-white disabled:text-gray-600">
                                            {isRunningStep === step.id ? <PaperAirplaneIcon className="h-5 w-5 animate-pulse" /> : <PaperAirplaneIcon className="h-5 w-5" />}
                                        </button>
                                   </div>
                               </div>
                           ))}
                        </div>
                        <div className="flex-shrink-0 flex space-x-2 pt-3 border-t border-gray-700">
                            <button onClick={handleAddStep} disabled={!activeWorkflow} className="flex-1 bg-gray-600 hover:bg-gray-500 p-2 rounded transition disabled:bg-gray-700 disabled:cursor-not-allowed flex items-center justify-center space-x-2"><PlusIcon className="h-5 w-5" /><span>Add Step</span></button>
                            <button onClick={handleDeleteSelectedSteps} disabled={selectedStepIds.size === 0} className="flex-1 bg-red-600/80 hover:bg-red-700 p-2 rounded transition disabled:bg-gray-700 disabled:cursor-not-allowed flex items-center justify-center space-x-2"><TrashIcon className="h-5 w-5" /><span>Delete Selected</span></button>
                        </div>
                    </div>
                </div>

                {/* Right Panel: Step Detail */}
                <div className="w-2/3 flex flex-col bg-gray-900/50 p-3 rounded-lg border border-gray-700">
                    {activeWorkflow && activeStepId && activeWorkflow.steps[activeStepIndex] ? (
                        <div className="flex flex-col h-full space-y-3">
                           <div className="flex-shrink-0 flex justify-between items-center">
                               <input type="text" value={activeWorkflow.name} onChange={e => setActiveWorkflow(p => p ? {...p, name: e.target.value} : null)} className="bg-transparent text-lg font-bold text-gray-200 p-1 -ml-1 rounded focus:bg-gray-700 outline-none" />
                               <div className="flex items-center space-x-2">
                                    <button onClick={() => setActiveStepId(activeWorkflow.steps[activeStepIndex - 1]?.id)} disabled={activeStepIndex <= 0} className="p-2 rounded-md hover:bg-gray-600 disabled:text-gray-600 disabled:cursor-not-allowed"><ChevronLeftIcon className="w-5 h-5"/></button>
                                    <span className="font-mono text-gray-400">{activeStepIndex + 1} / {activeWorkflow.steps.length}</span>
                                    <button onClick={() => setActiveStepId(activeWorkflow.steps[activeStepIndex + 1]?.id)} disabled={activeStepIndex >= activeWorkflow.steps.length - 1} className="p-2 rounded-md hover:bg-gray-600 disabled:text-gray-600 disabled:cursor-not-allowed"><ChevronRightIcon className="w-5 h-5"/></button>
                               </div>
                           </div>
                           <div className="flex-1 flex flex-col min-h-0">
                                <label className="font-semibold text-cyan-400 mb-1">Prompt</label>
                                <textarea value={activeWorkflow.steps[activeStepIndex].prompt} onChange={e => handleStepChange(activeStepId, { prompt: e.target.value })} className="w-full flex-1 bg-gray-800 p-2 rounded border border-gray-600 resize-none" />
                           </div>
                            <div className="flex-shrink-0 py-2">
                                <label className="font-semibold text-cyan-400 mb-1 block">Role</label>
                                <select
                                    value={activeWorkflow.steps[activeStepIndex].roleId || ''}
                                    onChange={e => handleStepChange(activeStepId, { roleId: e.target.value || undefined })}
                                    className="w-full bg-gray-700 p-2 rounded border border-gray-600"
                                >
                                    <option value="">None (Use global settings)</option>
                                    {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                                </select>
                            </div>
                           <div className="flex-1 flex flex-col min-h-0">
                               <label className="font-semibold text-cyan-400 mb-1">Response</label>
                               <div className="w-full flex-1 bg-gray-800 p-2 rounded border border-gray-600 overflow-y-auto whitespace-pre-wrap">{activeWorkflow.steps[activeStepIndex].response || <span className="text-gray-500">Run step to generate a response.</span>}</div>
                           </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-500">
                           {activeWorkflow ? "Select a step to view details, or add a new one." : "Select or create a workflow to begin."}
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Panel: Final Output */}
            <div className="flex-shrink-0 flex flex-col">
                <h3 className="font-semibold text-gray-300 mb-2">Final Output</h3>
                <div className="h-32 bg-gray-900/50 p-3 rounded-lg border border-gray-700 overflow-y-auto whitespace-pre-wrap">
                    {finalOutput || <span className="text-gray-500">The response from the last step will appear here.</span>}
                </div>
            </div>
        </div>
    );
};

export default WorkflowView;