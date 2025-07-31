

import React, { useState, useContext, useEffect, useCallback, useRef } from 'react';
import { Editor, useMonaco } from "@monaco-editor/react";
import FrameBox from '../FrameBox';
import { PlusIcon, DocumentTextIcon, ArrowUturnLeftIcon, ArrowUturnRightIcon, LinkIcon, ListBulletIcon, CodeBracketIcon, ChatBubbleOvalLeftEllipsisIcon, ChevronDownIcon, BrainCircuitIcon } from '../Icons';
import { OpenFileContext, ApiKeyContext, TaskContext, EditorContext } from '../../App';
import { runOcr, injectContextIntoTask } from '../../services/mindshardService';
import { EditorTab } from '../../types';
import useLocalStorage from '../../hooks/useLocalStorage';

const CloseIcon: React.FC<{className?: string; onClick?: (e: React.MouseEvent) => void}> = ({className, onClick}) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className} onClick={onClick}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
);

const EditorToolbar: React.FC<{ editorRef: React.MutableRefObject<any>, monacoRef: React.MutableRefObject<any> }> = ({ editorRef, monacoRef }) => {
    const [styleDropdownOpen, setStyleDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setStyleDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [dropdownRef]);


    const handleUndo = () => editorRef.current?.trigger('toolbar', 'undo', null);
    const handleRedo = () => editorRef.current?.trigger('toolbar', 'redo', null);

    const applyWrappingStyle = (prefix: string, suffix: string = prefix, defaultText: string = 'text') => {
        const editor = editorRef.current;
        if (!editor) return;
        const selection = editor.getSelection();
        if (!selection) return;

        const model = editor.getModel();
        const selectedText = model.getValueInRange(selection);
        const newText = `${prefix}${selectedText || defaultText}${suffix}`;

        editor.executeEdits('toolbar', [{ range: selection, text: newText, forceMoveMarkers: true }]);
        editor.focus();
    };
    
    const applyLineStyle = (prefix: string) => {
        const editor = editorRef.current;
        const monaco = monacoRef.current;
        if (!editor || !monaco) return;
        
        const selection = editor.getSelection();
        if (!selection) return;

        const model = editor.getModel();
        const edits = [];

        for (let i = selection.startLineNumber; i <= selection.endLineNumber; i++) {
            const currentPrefixMatch = model.getLineContent(i).match(/^(\s*#+\s|\s*>\s|\s*-\s|\s*\*\s|\s*\d+\.\s)?/);
            const currentPrefix = currentPrefixMatch ? currentPrefixMatch[0] : '';
            
            // Remove existing prefix
            edits.push({
                range: new monaco.Range(i, 1, i, 1 + currentPrefix.length),
                text: ''
            });
            // Add new prefix
            if(prefix) {
                edits.push({
                    range: new monaco.Range(i, 1, i, 1),
                    text: prefix
                });
            }
        }
        editor.executeEdits('toolbar', edits);
        editor.focus();
    };
    
    const styleOptions = [
        { label: 'Paragraph', action: () => applyLineStyle('') },
        { label: 'Heading 1', action: () => applyLineStyle('# ') },
        { label: 'Heading 2', action: () => applyLineStyle('## ') },
        { label: 'Heading 3', action: () => applyLineStyle('### ') },
    ];

    return (
        <div className="flex-shrink-0 p-1.5 border-b border-gray-700 bg-gray-900/50 flex items-center space-x-1">
            <button onClick={handleUndo} title="Undo (Ctrl+Z)" className="p-2 rounded hover:bg-gray-700 transition-colors"><ArrowUturnLeftIcon className="h-5 w-5" /></button>
            <button onClick={handleRedo} title="Redo (Ctrl+Y)" className="p-2 rounded hover:bg-gray-700 transition-colors"><ArrowUturnRightIcon className="h-5 w-5" /></button>
            <div className="w-px h-6 bg-gray-700 mx-1"></div>

            <div className="relative" ref={dropdownRef}>
                <button onClick={() => setStyleDropdownOpen(v => !v)} className="flex items-center space-x-2 p-2 rounded hover:bg-gray-700 transition-colors">
                    <span>Paragraph</span>
                    <ChevronDownIcon className="h-4 w-4" />
                </button>
                {styleDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1 w-40 bg-gray-800 border border-gray-600 rounded-md shadow-lg z-10 py-1">
                        {styleOptions.map(opt => (
                            <button key={opt.label} onClick={() => { opt.action(); setStyleDropdownOpen(false); }} className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors">{opt.label}</button>
                        ))}
                    </div>
                )}
            </div>

            <div className="w-px h-6 bg-gray-700 mx-1"></div>
            
            <button onClick={() => applyWrappingStyle('**')} title="Bold" className="p-2 rounded hover:bg-gray-700 transition-colors font-bold w-9">B</button>
            <button onClick={() => applyWrappingStyle('*')} title="Italic" className="p-2 rounded hover:bg-gray-700 transition-colors italic w-9">I</button>
            <button onClick={() => applyWrappingStyle('~~')} title="Strikethrough" className="p-2 rounded hover:bg-gray-700 transition-colors line-through w-9">S</button>
            
            <div className="w-px h-6 bg-gray-700 mx-1"></div>

            <button onClick={() => applyWrappingStyle('[', '](url)', 'link text')} title="Link" className="p-2 rounded hover:bg-gray-700 transition-colors"><LinkIcon className="h-5 w-5" /></button>
            <button onClick={() => applyLineStyle('> ')} title="Blockquote" className="p-2 rounded hover:bg-gray-700 transition-colors"><ChatBubbleOvalLeftEllipsisIcon className="h-5 w-5" /></button>
            <button onClick={() => applyLineStyle('- ')} title="Bulleted List" className="p-2 rounded hover:bg-gray-700 transition-colors"><ListBulletIcon className="h-5 w-5" /></button>
            <button onClick={() => applyWrappingStyle('```\n', '\n```', 'code')} title="Code Block" className="p-2 rounded hover:bg-gray-700 transition-colors"><CodeBracketIcon className="h-5 w-5" /></button>
        </div>
    )
}


const TextEditorPanel: React.FC = () => {
    const { setOpenFilePath } = useContext(OpenFileContext);
    const { apiKey } = useContext(ApiKeyContext);
    const { selectedTaskId } = useContext(TaskContext);
    const {
        openTabs,
        setOpenTabs,
        activeTabPath,
        setActiveTabPath,
        handleNewTab,
        handleCloseTab,
        handleSaveTab,
        handleSaveAllTabs
    } = useContext(EditorContext);
    
    const [isLoading, setIsLoading] = useState(false);
    const [isOcrRunning, setIsOcrRunning] = useState(false);
    const [isAgentAware, setIsAgentAware] = useLocalStorage('mindshard-aware-editor', true);
    const [injectionStatus, setInjectionStatus] = useState('');
    
    const editorRef = useRef<any>(null);
    const monacoRef = useRef<any>(null);

    const activeTab = openTabs.find(t => t.path === activeTabPath);

    const handleTabClick = (path: string) => {
        setActiveTabPath(path);
        const tab = openTabs.find(t => t.path === path);
        if (tab && !tab.isNew) {
            setOpenFilePath(path);
        } else {
            setOpenFilePath(null);
        }
    };

    const handleEditorChange = (value: string | undefined) => {
        if (!activeTab || value === activeTab.content) return;
        
        setOpenTabs(tabs => tabs.map(tab => 
            tab.path === activeTabPath 
            ? { ...tab, content: value || '', isDirty: true } 
            : tab
        ));
    };
    
    const handleEditorMount = (editor: any, monaco: any) => {
        editorRef.current = editor;
        monacoRef.current = monaco;
    };

    const handleRunOcr = async () => {
        if (!apiKey || !activeTab) return;
        setIsOcrRunning(true);
        try {
            const result = await runOcr(apiKey, activeTab.path, { lang: 'eng', layout: 'preserve', dpi: 300 });
            setOpenTabs(tabs => tabs.map(t => 
                t.path === activeTabPath 
                ? { ...t, content: result.text, viewMode: 'editor', isDirty: true }
                : t
            ));
        } catch(e) {
            console.error("OCR failed", e);
        } finally {
            setIsOcrRunning(false);
        }
    };
    
    const handleTogglePreview = () => {
        if (!activeTab) return;
        setOpenTabs(tabs => tabs.map(t => 
            t.path === activeTabPath 
            ? { ...t, viewMode: t.viewMode === 'editor' ? 'preview' : 'editor' }
            : t
        ));
    };

    const handleInjectContext = async () => {
        if (!apiKey || !selectedTaskId || !activeTab || !activeTab.content) return;
        setInjectionStatus('Injecting...');
        try {
            await injectContextIntoTask(apiKey, selectedTaskId, activeTab.content);
            setInjectionStatus('Context injected successfully!');
        } catch (error) {
            setInjectionStatus('Failed to inject context.');
        } finally {
            setTimeout(() => setInjectionStatus(''), 3000);
        }
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const ctrlOrCmd = e.ctrlKey || e.metaKey;
            if (ctrlOrCmd && e.key.toLowerCase() === 's') {
                e.preventDefault();
                if (activeTabPath) {
                    if (e.shiftKey) {
                        handleSaveTab(activeTabPath, true); // Save As
                    } else {
                        handleSaveTab(activeTabPath); // Save
                    }
                }
            }
             if (ctrlOrCmd && e.shiftKey && e.key.toLowerCase() === 's') {
                 e.preventDefault();
                 handleSaveAllTabs();
             }
            if (ctrlOrCmd && e.key.toLowerCase() === 'w') {
                e.preventDefault();
                if (activeTabPath) {
                    handleCloseTab(activeTabPath);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeTabPath, openTabs, handleSaveTab, handleSaveAllTabs, handleCloseTab]);

    return (
        <div className="p-4 flex flex-col h-full">
            <header className="flex-shrink-0 flex items-center justify-between border-b border-gray-700 pb-2 mb-4">
                <h2 className="text-xl font-bold text-gray-200">Editor</h2>
                <button
                    onClick={() => setIsAgentAware(p => !p)}
                    title={isAgentAware ? "The AI agent is aware of this panel's context." : "The AI agent is NOT aware of this panel's context."}
                    className={`p-1 rounded-full transition-colors ${isAgentAware ? 'text-cyan-400 bg-cyan-900/50 hover:bg-cyan-800/50' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700'}`}
                 >
                    <BrainCircuitIcon className="h-4 w-4" />
                 </button>
            </header>
            <div className="flex flex-col h-full">
                {/* Tab Bar */}
                <div className="flex-shrink-0 flex items-center border-b border-gray-700 bg-gray-900/50">
                    {openTabs.map(tab => (
                        <button 
                            key={tab.path} 
                            onClick={() => handleTabClick(tab.path)}
                            className={`flex items-center space-x-2 py-2 px-4 border-r border-gray-700 text-sm transition-colors max-w-[200px] ${activeTabPath === tab.path ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700/50'}`}
                        >
                            <span className="truncate">{tab.path.split('/').pop()}{tab.isDirty ? '*' : ''}</span>
                            <CloseIcon className="h-4 w-4 text-gray-500 hover:text-white flex-shrink-0" onClick={(e) => handleCloseTab(tab.path, e)} />
                        </button>
                    ))}
                    <button onClick={handleNewTab} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700/50">
                        <PlusIcon className="h-5 w-5" />
                    </button>
                </div>
                
                {/* Editor Toolbar */}
                {activeTab && !activeTab.isMedia && (
                    <EditorToolbar editorRef={editorRef} monacoRef={monacoRef} />
                )}

                {/* Editor/Preview Area */}
                <div className="flex-1 overflow-hidden bg-gray-800">
                    {!activeTab ? (
                         <div className="flex items-center justify-center h-full text-gray-500">
                            Select a file from the Project Explorer or create a new one.
                        </div>
                    ) : isLoading ? (
                        <div className="flex h-full items-center justify-center text-gray-400">Loading file...</div>
                    ) : activeTab.isMedia && activeTab.viewMode === 'preview' ? (
                        <div className="h-full bg-gray-800 flex items-center justify-center p-4">
                           {activeTab.mediaContent?.startsWith('data:image') && <img src={activeTab.mediaContent} alt={activeTab.path} className="max-h-full max-w-full object-contain" />}
                           {activeTab.mediaContent?.startsWith('data:application/pdf') && (
                               <div className="text-center text-gray-400">
                                   <DocumentTextIcon className="h-24 w-24 mx-auto text-gray-500" />
                                   <h3 className="text-lg mt-4">PDF Preview</h3>
                                   <p className="text-sm">{activeTab.path.split('/').pop()}</p>
                                   <p className="mt-4 text-xs">Full PDF previews are not supported. Run OCR to view content.</p>
                               </div>
                           )}
                        </div>
                    ) : (
                        <Editor
                            height="100%"
                            path={activeTab.path}
                            language={activeTab.path.endsWith('.md') ? 'markdown' : (activeTab.path.split('.').pop() || 'plaintext')}
                            theme="vs-dark"
                            value={activeTab.content}
                            onMount={handleEditorMount}
                            onChange={handleEditorChange}
                            options={{
                                minimap: { enabled: true },
                                fontSize: 14,
                                wordWrap: 'on',
                                readOnly: false,
                            }}
                        />
                    )}
                </div>

                 {/* Bottom Toolbar */}
                <div className="flex-shrink-0 p-2 border-t border-gray-700 flex items-center justify-between">
                     <div className="flex items-center space-x-2">
                        <button onClick={() => activeTab && handleSaveTab(activeTab.path, false)} disabled={!activeTab || !activeTab.isDirty} className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-1 px-3 rounded text-sm transition disabled:bg-gray-500">Save</button>
                        <button onClick={() => activeTab && handleSaveTab(activeTab.path, true)} disabled={!activeTab} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-1 px-3 rounded text-sm transition">Save As...</button>
                        <button onClick={handleSaveAllTabs} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-1 px-3 rounded text-sm transition">Save All</button>
                        <button
                            onClick={handleInjectContext}
                            disabled={!selectedTaskId || !activeTab?.content}
                            title={!selectedTaskId ? "Select a task in the Thought Tree first" : "Inject this editor's content into the selected task"}
                            className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-1 px-3 rounded text-sm transition disabled:bg-gray-500 disabled:cursor-not-allowed"
                        >
                            Inject as Context
                        </button>
                        {injectionStatus && <span className="text-xs text-purple-300">{injectionStatus}</span>}
                     </div>
                      <div className="flex items-center space-x-2">
                         {activeTab?.isMedia && (
                             <button onClick={handleRunOcr} disabled={isOcrRunning} className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-1 px-3 rounded text-sm transition disabled:bg-gray-500">
                                {isOcrRunning ? 'Running OCR...' : 'Run OCR'}
                            </button>
                         )}
                         {activeTab?.isMedia && (
                            <button onClick={handleTogglePreview} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-1 px-3 rounded text-sm transition">
                                {activeTab.viewMode === 'editor' ? 'Show Preview' : 'Show Text'}
                            </button>
                         )}
                      </div>
                </div>
            </div>
        </div>
    );
};

export default TextEditorPanel;