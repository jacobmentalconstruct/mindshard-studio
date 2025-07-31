

import React, { useState, useEffect, useContext, useCallback } from 'react';
import { KnowledgeBase } from '../../types';
import { getKnowledgeBases, createKnowledgeBase, activateKnowledgeBase, deleteKnowledgeBase } from '../../services/mindshardService';
import { ApiKeyContext } from '../../App';
import FrameBox from '../FrameBox';
import { TrashIcon, GlobeAltIcon, FileIcon, CheckCircleIcon } from '../Icons';
import useLocalStorage from '../../hooks/useLocalStorage';

const KnowledgePanel: React.FC = () => {
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [exploredKb, setExploredKb] = useState<KnowledgeBase | null>(null);
  const { apiKey } = useContext(ApiKeyContext);

  const fetchKbs = useCallback(() => {
    if (!apiKey) return;
    setIsLoading(true);
    getKnowledgeBases(apiKey)
      .then(setKnowledgeBases)
      .finally(() => setIsLoading(false));
  }, [apiKey]);

  useEffect(() => {
    fetchKbs();
  }, [fetchKbs]);

  const handleCreate = async () => {
    const name = prompt("Enter new Knowledge Base name:");
    if (name && apiKey) {
        await createKnowledgeBase(apiKey, name);
        fetchKbs();
    }
  };

  const handleActivate = async (id: string) => {
    if (!apiKey) return;
    const updatedKbs = await activateKnowledgeBase(apiKey, id);
    setKnowledgeBases(updatedKbs);
  };

  const handleDelete = async (id: string) => {
      if (!apiKey || !window.confirm("Are you sure you want to delete this knowledge base?")) return;
      await deleteKnowledgeBase(apiKey, id);
      fetchKbs();
      if(exploredKb?.id === id) setExploredKb(null);
  };

  const systemKbs = knowledgeBases.filter(kb => kb.system);
  const userKbs = knowledgeBases.filter(kb => !kb.system);

  if (exploredKb) {
      return (
        <div className="p-4 flex flex-col h-full">
            <h2 className="text-xl font-bold text-gray-300 border-b border-gray-700 pb-2 mb-4 flex-shrink-0">{`Exploring: ${exploredKb.name}`}</h2>
            <div className="flex flex-col h-full">
                <button onClick={() => setExploredKb(null)} className="self-start mb-4 bg-gray-600 hover:bg-gray-500 text-white font-bold py-1 px-3 rounded text-sm transition">
                    &larr; Back to List
                </button>
                <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                    <h3 className="text-lg font-semibold">Digested Sources</h3>
                    {exploredKb.sources && exploredKb.sources.length > 0 ? (
                        exploredKb.sources.map(source => (
                            <div key={source.id} className="bg-gray-700/50 p-2 rounded flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                    {source.type === 'file' ? <FileIcon className="h-5 w-5 text-gray-400" /> : <GlobeAltIcon className="h-5 w-5 text-cyan-400" />}
                                    <span className="text-sm font-mono">{source.name}</span>
                                </div>
                                <button title="Remove source" className="text-red-500 hover:text-red-400">
                                    <TrashIcon className="h-4 w-4" />
                                </button>
                            </div>
                        ))
                    ) : (
                        <p className="text-gray-500">No sources found in this Knowledge Base.</p>
                    )}
                </div>
            </div>
        </div>
      )
  }

  return (
    <div className="p-4 flex flex-col h-full">
        <h2 className="text-xl font-bold text-gray-300 border-b border-gray-700 pb-2 mb-4 flex-shrink-0">Library of KBs</h2>
        <div className="flex flex-col h-full space-y-4">
            <div className="flex justify-between items-center flex-shrink-0">
                <h2 className="text-xl font-semibold">Knowledge Bases</h2>
                <button onClick={handleCreate} className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-2 px-4 rounded transition text-sm">
                    Create Knowledge Base
                </button>
            </div>

            {isLoading && <p className="flex-shrink-0">Loading...</p>}
            
            {/* System KB Section */}
            {systemKbs.length > 0 && (
              <div className="space-y-2 flex-shrink-0">
                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Live State</h3>
                {systemKbs.map(kb => (
                  <div key={kb.id} className="bg-cyan-900/30 p-3 rounded-lg border border-cyan-700/50 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-lg text-cyan-300">{kb.name}</h4>
                      <p className="text-xs text-cyan-400">{kb.contentCount} files indexed</p>
                    </div>
                    <div className="flex items-center space-x-2 text-green-400 text-sm">
                      <CheckCircleIcon className="h-5 w-5" />
                      <span>Active & Synced</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-3 pr-2 min-h-0">
              {userKbs.length > 0 && <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">User Knowledge Bases</h3>}
              {userKbs.map(kb => (
                  <div key={kb.id} className="bg-gray-700/50 p-3 rounded-lg border border-gray-600 flex items-center justify-between">
                      <div>
                          <h4 className="font-bold text-lg text-cyan-400">{kb.name}</h4>
                          <p className="text-xs text-gray-400">{kb.contentCount} sources</p>
                      </div>
                      <div className="flex items-center space-x-3">
                          <button onClick={() => setExploredKb(kb)} className="text-sm bg-gray-600 hover:bg-gray-500 py-1 px-3 rounded">Explore</button>
                            <button onClick={() => handleDelete(kb.id)} className="text-red-500 hover:text-red-400 p-1 rounded-full bg-gray-800/50 hover:bg-gray-800">
                              <TrashIcon className="h-5 w-5"/>
                          </button>
                          <label title="Activate this KB" className="flex items-center text-sm space-x-2 cursor-pointer">
                              <span className="text-gray-400">Active</span>
                              <div className="relative">
                                  <input type="checkbox" checked={kb.active} onChange={() => handleActivate(kb.id)} className="sr-only peer" />
                                  <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                              </div>
                          </label>
                      </div>
                  </div>
              ))}
            </div>
        </div>
    </div>
  );
};

export default KnowledgePanel;