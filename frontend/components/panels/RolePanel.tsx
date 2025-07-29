

import React, { useState, useEffect, useContext, useCallback, useMemo, useRef } from 'react';
import { Role, KnowledgeBase, MemoryPolicy } from '../../types';
import { listRoles, createRole, updateRole, deleteRole, getKnowledgeBases, ingestUrl, ingestFile } from '../../services/mindshardService';
import { ApiKeyContext, RoleContext } from '../../App';
import FrameBox from '../FrameBox';
import { PlusIcon, TrashIcon, ChevronDownIcon, CheckCircleIcon } from '../Icons';

const EMPTY_ROLE_DETAILS: Omit<Role, 'id'> = {
    name: '',
    description: '',
    system_prompt: '',
    knowledge_bases: [],
    memory_policy: 'scratchpad',
};

const RolePanel: React.FC = () => {
    const { apiKey } = useContext(ApiKeyContext);
    const { roles, setRoles, activeRole, setActiveRole } = useContext(RoleContext);

    const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
    const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
    const [activeDetails, setActiveDetails] = useState<Partial<Role>>(EMPTY_ROLE_DETAILS);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    
    // State for Curation
    const [curateMenuOpen, setCurateMenuOpen] = useState<boolean>(false);
    const [curationTargetKbId, setCurationTargetKbId] = useState<string>('');
    const [ingestionMessage, setIngestionMessage] = useState<string>('');
    const fileInputRef = useRef<HTMLInputElement>(null);


    const fetchRolesAndKBs = useCallback(() => {
        if (!apiKey) return;
        setIsLoading(true);
        Promise.all([listRoles(apiKey), getKnowledgeBases(apiKey)])
            .then(([rolesData, kbsData]) => {
                setRoles(rolesData);
                setKnowledgeBases(kbsData);
            })
            .finally(() => setIsLoading(false));
    }, [apiKey, setRoles]);

    useEffect(() => {
        fetchRolesAndKBs();
    }, [fetchRolesAndKBs]);

    const handleSelectRole = useCallback((roleId: string) => {
        setSelectedRoleId(roleId);
        const role = roles.find(r => r.id === roleId);
        if (role) {
            setActiveDetails(role);
            setCurationTargetKbId(role.knowledge_bases?.[0] || '');
        }
    }, [roles]);
    
    const handleNewRole = () => {
        setSelectedRoleId(null);
        setActiveDetails({ ...EMPTY_ROLE_DETAILS, name: "New Role" });
        setCurationTargetKbId('');
    };

    const handleInputChange = (field: keyof Role, value: any) => {
        setActiveDetails(prev => ({ ...prev, [field]: value }));
    };

    const handleKbToggle = (kbId: string) => {
        const currentKbs = activeDetails.knowledge_bases || [];
        const newKbs = currentKbs.includes(kbId)
            ? currentKbs.filter(id => id !== kbId)
            : [...currentKbs, kbId];
        handleInputChange('knowledge_bases', newKbs);
        
        // If the currently selected curation KB was removed, select the first available one
        if (!newKbs.includes(curationTargetKbId)){
            setCurationTargetKbId(newKbs[0] || '');
        }
    };

    const handleSave = async () => {
        if (!apiKey || !activeDetails.name) return;
        setIsSaving(true);
        try {
            let savedRole;
            if (selectedRoleId && activeDetails.id) { // Update existing
                savedRole = await updateRole(apiKey, activeDetails as Role);
            } else { // Create new
                savedRole = await createRole(apiKey, activeDetails as Omit<Role, 'id'>);
                setSelectedRoleId(savedRole.id);
                setActiveDetails(savedRole);
            }
            fetchRolesAndKBs(); // Refresh list
            // If the active role was the one being edited, update it in context
            if (activeRole?.id === savedRole.id) {
                setActiveRole(savedRole);
            }
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleDelete = async () => {
        if (!apiKey || !selectedRoleId || !window.confirm(`Are you sure you want to delete the role "${activeDetails.name}"?`)) return;
        
        // If deleting the active role, unset it
        if (activeRole?.id === selectedRoleId) {
            setActiveRole(null);
        }
        await deleteRole(apiKey, selectedRoleId);
        fetchRolesAndKBs();
        setSelectedRoleId(null);
        setActiveDetails(EMPTY_ROLE_DETAILS);
    }
    
    const filteredRoles = useMemo(() =>
        roles.filter(role => role.name.toLowerCase().includes(searchTerm.toLowerCase())),
        [roles, searchTerm]
    );

    // --- Curation Handlers ---
    const handleCurateUrl = async () => {
        setCurateMenuOpen(false);
        const url = window.prompt("Enter the URL to ingest:");
        if (url && apiKey && curationTargetKbId) {
            setIngestionMessage(`Ingesting URL...`);
            await ingestUrl(apiKey, url, curationTargetKbId);
            setIngestionMessage(`Successfully ingested URL.`);
            setTimeout(() => setIngestionMessage(''), 3000);
            fetchRolesAndKBs(); // To update content counts potentially
        }
    };

    const handleCurateFile = () => {
        setCurateMenuOpen(false);
        fileInputRef.current?.click();
    };
    
    const onFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || !apiKey || !curationTargetKbId) return;
        const files = Array.from(e.target.files);
        setIngestionMessage(`Ingesting ${files.length} file(s)...`);

        for (const file of files) {
            await ingestFile(apiKey, file, curationTargetKbId);
        }
        setIngestionMessage(`Successfully ingested file(s).`);
        setTimeout(() => setIngestionMessage(''), 3000);
        if(e.target) e.target.value = ''; // Reset file input
        fetchRolesAndKBs();
    };

    return (
        <div className="p-4">
        <h2 className="text-xl font-bold text-gray-300 border-b border-gray-700 pb-2 mb-4">Inference › Roles</h2>
        <div className="flex h-full space-x-4" style={{maxHeight: 'calc(100vh - 200px)'}}>
            {/* Left Column: List */}
            <div className="w-1/3 flex flex-col border-r border-gray-700 pr-4">
                <div className="flex space-x-2 mb-4">
                    <button onClick={handleNewRole} className="flex items-center justify-center space-x-2 w-full bg-cyan-500 hover:bg-cyan-600 p-2 rounded transition text-sm">
                        <PlusIcon className="h-5 w-5"/>
                        <span>New Role</span>
                    </button>
                </div>
                <input
                    type="search"
                    placeholder="Search roles..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-gray-700 p-2 rounded-md w-full mb-4 text-sm"
                />
                <div className="flex-1 overflow-y-auto space-y-2">
                    {isLoading && <p>Loading...</p>}
                    {filteredRoles.map(role => (
                        <button
                            key={role.id}
                            onClick={() => handleSelectRole(role.id)}
                            className={`w-full text-left p-2 rounded-md transition-colors flex items-center space-x-2
                                ${selectedRoleId === role.id ? 'bg-cyan-500/80 text-white' : 'bg-gray-700 hover:bg-gray-600'}
                                ${activeRole?.id === role.id ? 'ring-2 ring-green-400' : ''}
                            `}
                        >
                            {activeRole?.id === role.id && <CheckCircleIcon className="h-5 w-5 text-green-300 flex-shrink-0" />}
                            <span className="flex-grow">{role.name}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Right Column: Details */}
            <div className="w-2/3 flex flex-col space-y-4 overflow-y-auto pr-2">
                {activeDetails.name !== undefined ? (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Role Name</label>
                            <input type="text" value={activeDetails.name} onChange={e => handleInputChange('name', e.target.value)} className="w-full bg-gray-700 p-2 rounded" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Description</label>
                            <textarea value={activeDetails.description} onChange={e => handleInputChange('description', e.target.value)} rows={3} className="w-full bg-gray-700 p-2 rounded" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">System Prompt</label>
                            <textarea value={activeDetails.system_prompt} onChange={e => handleInputChange('system_prompt', e.target.value)} rows={6} className="w-full bg-gray-700 p-2 rounded font-mono text-sm" />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Knowledge Bases</label>
                            <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-600 max-h-32 overflow-y-auto space-y-2">
                                {knowledgeBases.map(kb => (
                                    <label key={kb.id} className="flex items-center space-x-3 cursor-pointer">
                                        <input type="checkbox" checked={activeDetails.knowledge_bases?.includes(kb.id) || false} onChange={() => handleKbToggle(kb.id)} className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-cyan-500 focus:ring-cyan-500" />
                                        <span>{kb.name}</span>
                                    </label>
                                ))}
                            </div>
                            <div className="mt-2 p-2 bg-gray-900/50 rounded-lg border border-gray-700 space-y-2">
                                <h4 className="text-xs font-semibold text-gray-400">Curate Sources for Role</h4>
                                <div className="flex items-center space-x-2">
                                    <select 
                                        value={curationTargetKbId}
                                        onChange={e => setCurationTargetKbId(e.target.value)}
                                        className="w-full bg-gray-700 p-1.5 rounded text-sm disabled:bg-gray-800 disabled:text-gray-500"
                                        disabled={!activeDetails.knowledge_bases || activeDetails.knowledge_bases.length === 0}
                                    >
                                        <option value="" disabled>Select a KB</option>
                                        {activeDetails.knowledge_bases?.map(kbId => {
                                            const kb = knowledgeBases.find(k => k.id === kbId);
                                            return kb ? <option key={kb.id} value={kb.id}>{kb.name}</option> : null;
                                        })}
                                    </select>
                                    <div className="relative flex-shrink-0">
                                        <button onClick={() => setCurateMenuOpen(v => !v)} disabled={!curationTargetKbId} className="flex items-center space-x-1 text-sm text-gray-300 bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-md disabled:bg-gray-800 disabled:cursor-not-allowed">
                                            <span>Add...</span>
                                            <ChevronDownIcon className="h-4 w-4" />
                                        </button>
                                        {curateMenuOpen && (
                                            <div className="absolute top-full right-0 mt-1 w-32 bg-gray-800 border border-gray-700 rounded-md shadow-lg z-20">
                                                <button onClick={handleCurateUrl} className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700">URL...</button>
                                                <button onClick={handleCurateFile} className="block w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700">File...</button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {ingestionMessage && <p className="text-xs text-cyan-300 px-1 pt-1">{ingestionMessage}</p>}
                                <input type="file" multiple ref={fileInputRef} onChange={onFileSelected} className="hidden" />
                            </div>
                        </div>
                         <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Memory Policy</label>
                            <div className="flex space-x-4 bg-gray-900/50 p-2 rounded-lg border border-gray-600">
                                <label className="flex items-center space-x-2 cursor-pointer">
                                    <input type="radio" name="memory_policy" value="scratchpad" checked={activeDetails.memory_policy === 'scratchpad'} onChange={e => handleInputChange('memory_policy', e.target.value as MemoryPolicy)} className="h-4 w-4 text-cyan-500 bg-gray-700 border-gray-600 focus:ring-cyan-500" />
                                    <span>Chat History Enabled</span>
                                </label>
                                <label className="flex items-center space-x-2 cursor-pointer">
                                    <input type="radio" name="memory_policy" value="auto_commit" checked={activeDetails.memory_policy === 'auto_commit'} onChange={e => handleInputChange('memory_policy', e.target.value as MemoryPolicy)} className="h-4 w-4 text-cyan-500 bg-gray-700 border-gray-600 focus:ring-cyan-500" />
                                    <span>Contextually Isolated</span>
                                </label>
                            </div>
                        </div>
                        <div>
                            <button
                                onClick={() => setActiveRole(roles.find(r => r.id === selectedRoleId) || null)}
                                disabled={!selectedRoleId || activeRole?.id === selectedRoleId}
                                className="w-full mt-4 p-2 rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                            >
                                <CheckCircleIcon className="h-5 w-5" />
                                <span>{activeRole?.id === selectedRoleId ? 'This is the Active Role' : 'Set as Active Role for Chat'}</span>
                            </button>
                        </div>
                        <div className="flex space-x-4 pt-4">
                            <button onClick={handleSave} disabled={isSaving} className="bg-green-600 hover:bg-green-700 p-2 rounded-md flex-grow disabled:bg-gray-500">
                                {isSaving ? 'Saving...' : 'Save Changes'}
                            </button>
                            {selectedRoleId && (
                                <button onClick={handleDelete} className="bg-red-600/80 hover:bg-red-700 p-2 rounded-md flex items-center justify-center space-x-2">
                                    <TrashIcon className="h-5 w-5" />
                                    <span>Delete</span>
                                </button>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex items-center justify-center h-full text-gray-500">
                        Select a role to view details, or create a new one.
                    </div>
                )}
            </div>
        </div>
        </div>
    );
};

export default RolePanel;