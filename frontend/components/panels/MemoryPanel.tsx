

import React, { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { MemoryEntry } from '../../types';
import { 
    getScratchpad, 
    getLongTermMemory, 
    addToScratchpad, 
    commitSingleScratchpadEntry, 
    deleteScratchpadEntry,
    updateLongTermEntry,
    deleteLongTermEntry
} from '../../services/mindshardService';
import { ApiKeyContext } from '../../App';
import { TrashIcon, PencilIcon, ArrowUpTrayIcon } from '../Icons';

type MemoryView = 'scratchpad' | 'long-term';

const MemoryPanel: React.FC = () => {
  const [view, setView] = useState<MemoryView>('scratchpad');
  const [scratchpad, setScratchpad] = useState<MemoryEntry[]>([]);
  const [longTerm, setLongTerm] = useState<MemoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { apiKey } = useContext(ApiKeyContext);

  const fetchAll = useCallback(() => {
    if (!apiKey) return;
    setIsLoading(true);
    Promise.all([
      getScratchpad(apiKey),
      getLongTermMemory(apiKey)
    ]).then(([scratchData, longTermData]) => {
      setScratchpad(scratchData);
      setLongTerm(longTermData);
    }).catch(() => setError('Failed to fetch memory entries.'))
    .finally(() => setIsLoading(false));
  }, [apiKey]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const ScratchpadView = () => {
    const [content, setContent] = useState('');

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!apiKey || !content) return;
        await addToScratchpad(apiKey, { content });
        setContent('');
        fetchAll();
    };

    const handleCommit = async (entryId: string) => {
        if (!apiKey) return;
        await commitSingleScratchpadEntry(apiKey, entryId);
        fetchAll();
    };
    
    const handleDelete = async (entryId: string) => {
        if (!apiKey) return;
        await deleteScratchpadEntry(apiKey, entryId);
        fetchAll();
    };

    return (
        <div className="space-y-4">
            <form onSubmit={handleAdd} className="space-y-3 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                <label className="font-semibold text-gray-300">Add to Scratchpad:</label>
                <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Type any note here…" rows={3} className="w-full bg-gray-700 p-2 rounded"/>
                <div className="flex justify-end">
                    <button type="submit" className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-2 px-4 rounded transition">Save</button>
                </div>
            </form>
            <div className="space-y-3 pt-4">
                <h3 className="font-semibold text-gray-300">Recent Scratch Entries:</h3>
                <div className="space-y-2">
                {isLoading ? <p>Loading...</p> : scratchpad.length > 0 ? scratchpad.map((entry) => (
                    <div key={entry.id} className="bg-gray-800/70 p-3 rounded-lg flex items-center justify-between">
                        <div className="flex-grow">
                            <p className="text-gray-300">{entry.content}</p>
                            <div className="text-xs text-gray-500 mt-1">
                                <span className="font-mono">{new Date(entry.timestamp).toLocaleString()}</span>
                            </div>
                        </div>
                        <div className="flex space-x-2 flex-shrink-0 ml-4">
                            <button onClick={() => handleCommit(entry.id)} title="Commit to Long-Term" className="p-2 text-gray-400 hover:text-green-400 transition rounded-full hover:bg-gray-700">
                                <ArrowUpTrayIcon className="h-5 w-5" />
                            </button>
                            <button onClick={() => handleDelete(entry.id)} title="Delete" className="p-2 text-gray-400 hover:text-red-400 transition rounded-full hover:bg-gray-700">
                                <TrashIcon className="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                )) : <p className="text-gray-500 text-center py-4">Scratchpad is empty.</p>}
                </div>
            </div>
        </div>
    );
  };
  
  const LongTermView = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [tagFilter, setTagFilter] = useState('');
    const [editingEntry, setEditingEntry] = useState<MemoryEntry | null>(null);

    const handleEdit = (entry: MemoryEntry) => {
        setEditingEntry(JSON.parse(JSON.stringify(entry))); // deep copy
    };

    const handleCancelEdit = () => {
        setEditingEntry(null);
    };

    const handleSaveEdit = async () => {
        if (!apiKey || !editingEntry) return;
        const {id, ...updates} = editingEntry;
        await updateLongTermEntry(apiKey, id, updates);
        setEditingEntry(null);
        fetchAll();
    };

    const handleDelete = async (entryId: string) => {
        if (!apiKey || !window.confirm("Are you sure you want to permanently delete this memory?")) return;
        await deleteLongTermEntry(apiKey, entryId);
        fetchAll();
    };

    const filteredLongTerm = useMemo(() => {
        return longTerm.filter(entry => {
            const contentMatch = entry.content.toLowerCase().includes(searchTerm.toLowerCase());
            const tagMatch = tagFilter ? (entry.tags || []).some(tag => tag.toLowerCase().includes(tagFilter.toLowerCase())) : true;
            return contentMatch && tagMatch;
        });
    }, [longTerm, searchTerm, tagFilter]);

    if (editingEntry) {
        return (
            <div className="space-y-4 p-4 bg-gray-900/50 rounded-lg border border-cyan-500/50">
                <h3 className="text-lg font-bold text-cyan-400">Edit Entry</h3>
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Content</label>
                    <textarea 
                        value={editingEntry.content} 
                        onChange={e => setEditingEntry({...editingEntry, content: e.target.value})} 
                        rows={5} 
                        className="w-full bg-gray-700 p-2 rounded"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Tags (comma-separated)</label>
                    <input 
                        type="text" 
                        value={(editingEntry.tags || []).join(', ')} 
                        onChange={e => setEditingEntry({...editingEntry, tags: e.target.value.split(/,\s*/)}) }
                        className="w-full bg-gray-700 p-2 rounded"
                    />
                </div>
                <div className="flex justify-end space-x-4">
                    <button onClick={handleCancelEdit} className="py-2 px-4 bg-gray-600 rounded">Cancel</button>
                    <button onClick={handleSaveEdit} className="py-2 px-4 bg-cyan-500 rounded">Save Changes</button>
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex space-x-4 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                <input 
                    type="search"
                    placeholder="Search memory..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="flex-grow bg-gray-700 p-2 rounded"
                />
                <input 
                    type="search"
                    placeholder="Filter by tag..."
                    value={tagFilter}
                    onChange={e => setTagFilter(e.target.value)}
                    className="flex-grow bg-gray-700 p-2 rounded"
                />
            </div>
            <div className="space-y-2">
                {isLoading ? <p>Loading...</p> : filteredLongTerm.length > 0 ? filteredLongTerm.map(entry => (
                    <div key={entry.id} className="bg-gray-800/70 p-3 rounded-lg flex items-center justify-between">
                        <div>
                            <p className="text-gray-300">{entry.content}</p>
                            <div className="flex items-center space-x-2 mt-2">
                                <span className="text-xs text-gray-500 font-mono">{new Date(entry.timestamp).toLocaleString()}</span>
                                {(entry.tags || []).filter(t=>t).map(tag => (
                                    <span key={tag} className="text-xs bg-gray-600 px-2 py-0.5 rounded-full">{tag}</span>
                                ))}
                            </div>
                        </div>
                        <div className="flex space-x-2 flex-shrink-0 ml-4">
                             <button onClick={() => handleEdit(entry)} title="Edit" className="p-2 text-gray-400 hover:text-cyan-400 transition rounded-full hover:bg-gray-700">
                                <PencilIcon className="h-5 w-5" />
                            </button>
                            <button onClick={() => handleDelete(entry.id)} title="Delete" className="p-2 text-gray-400 hover:text-red-400 transition rounded-full hover:bg-gray-700">
                                <TrashIcon className="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                )) : <p className="text-gray-500 text-center py-4">No long-term memories found matching criteria.</p>}
            </div>
        </div>
    );
  };

  return (
    <div className="p-4 h-full flex flex-col">
        <h2 className="text-xl font-bold text-gray-300 border-b border-gray-700 pb-2 mb-4 flex-shrink-0">Inference › Memory</h2>
        <div className="flex space-x-1 rounded-lg bg-gray-700 p-1 mb-4 flex-shrink-0">
            <button onClick={() => setView('scratchpad')} className={`w-full rounded-md py-2 text-sm font-medium transition ${view === 'scratchpad' ? 'bg-cyan-500 text-white' : 'text-gray-300 hover:bg-gray-600'}`}>Scratchpad</button>
            <button onClick={() => setView('long-term')} className={`w-full rounded-md py-2 text-sm font-medium transition ${view === 'long-term' ? 'bg-cyan-500 text-white' : 'text-gray-300 hover:bg-gray-600'}`}>Long-Term</button>
        </div>
        {error && <p className="text-red-500 flex-shrink-0">{error}</p>}
        <div className="flex-grow overflow-y-auto pr-2">
            {view === 'scratchpad' ? <ScratchpadView /> : <LongTermView />}
        </div>
    </div>
  );
};

export default MemoryPanel;