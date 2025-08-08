
import React, { useState, useEffect, useContext, useCallback } from 'react';
import { Commit } from '../../types';
import { getCommits, createSnapshot, revertToCommit } from '../../services/mindshardService';
import { useAppStore } from '../../stores/appStore';
import FrameBox from '../FrameBox';
import useTauriStore from '../../hooks/useTauriStore';
import { BrainCircuitIcon } from '../Icons';

const DiffLine: React.FC<{ line: string }> = ({ line }) => {
    const isAdded = line.startsWith('+');
    const isRemoved = line.startsWith('-');
    const isInfo = line.startsWith('@@') || line.startsWith('---') || line.startsWith('+++');

    let bgColor = '';
    if (isAdded) bgColor = 'bg-green-900/40';
    if (isRemoved) bgColor = 'bg-red-900/40';
    if (isInfo) bgColor = 'bg-cyan-900/30';

    return (
        <div className={`flex ${bgColor}`}>
            <div className="w-8 text-center text-gray-500">{isAdded ? '+' : isRemoved ? '-' : ' '}</div>
            <div className={`flex-1 ${isInfo ? 'text-cyan-400' : ''}`}>{line.substring(isInfo ? 0 : 1)}</div>
        </div>
    );
};


const VersioningPanel: React.FC = () => {
    const apiKey = useAppStore(state => state.apiKey);
    const [commits, setCommits] = useState<Commit[]>([]);
    const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isAgentAware, setIsAgentAware] = useTauriStore('mindshard-aware-versioning', true);

    const fetchCommits = useCallback(() => {
        if (!apiKey) return;
        setIsLoading(true);
        getCommits(apiKey)
            .then(data => {
                setCommits(data);
                if (data.length > 0 && !selectedCommit) {
                    setSelectedCommit(data[0]);
                }
            })
            .finally(() => setIsLoading(false));
    }, [apiKey, selectedCommit]);

    useEffect(() => {
        fetchCommits();
    }, [fetchCommits]);

    const handleCreateSnapshot = async () => {
        if (!apiKey) return;
        const message = window.prompt("Enter a message for this snapshot:");
        if (message) {
            await createSnapshot(apiKey, message);
            fetchCommits();
        }
    };

    const handleRevert = async () => {
        if (!apiKey || !selectedCommit || !window.confirm(`Are you sure you want to revert all changes to commit "${selectedCommit.message}"? This is irreversible.`)) return;
        await revertToCommit(apiKey, selectedCommit.sha);
        alert(`Project reverted to ${selectedCommit.sha}.`);
        fetchCommits();
    };


    return (
        <div className="p-4 flex flex-col h-full">
            <header className="flex-shrink-0 flex items-center justify-between border-b border-gray-700 pb-2 mb-4">
                <h2 className="text-xl font-bold text-gray-200">Versioning & Backup</h2>
                <button
                    onClick={() => setIsAgentAware(p => !p)}
                    title={isAgentAware ? "The AI agent is aware of this panel's context." : "The AI agent is NOT aware of this panel's context."}
                    className={`p-1 rounded-full transition-colors ${isAgentAware ? 'text-cyan-400 bg-cyan-900/50 hover:bg-cyan-800/50' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700'}`}
                 >
                    <BrainCircuitIcon className="h-4 w-4" />
                 </button>
            </header>
            <div className="flex flex-col h-full space-y-4">
                {/* Toolbar */}
                <div className="flex-shrink-0 flex items-center space-x-2 p-2 bg-gray-900/50 rounded-md border border-gray-700">
                    <button onClick={handleCreateSnapshot} className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold py-1.5 px-3 rounded text-sm transition">Create Snapshot</button>
                    <button className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-1.5 px-3 rounded text-sm transition disabled:opacity-50" disabled>Configure Auto-Backup ▼</button>
                    <button className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-1.5 px-3 rounded text-sm transition disabled:opacity-50" disabled>Connect GitHub</button>
                </div>

                {/* Main Content */}
                <div className="flex-1 flex space-x-4 min-h-0">
                    {/* Commit List */}
                    <div className="w-2/5 flex flex-col bg-gray-900/50 p-3 rounded-lg border border-gray-700">
                        <h3 className="text-md font-semibold mb-2 flex-shrink-0">Commit History</h3>
                        <div className="flex-1 overflow-y-auto pr-2 space-y-2">
                            {isLoading && <p>Loading history...</p>}
                            {commits.map(commit => (
                                <div
                                    key={commit.sha}
                                    onClick={() => setSelectedCommit(commit)}
                                    className={`p-2 rounded-md cursor-pointer border ${selectedCommit?.sha === commit.sha ? 'bg-cyan-500/20 border-cyan-500' : 'bg-gray-800 border-gray-700 hover:bg-gray-700/50'}`}
                                >
                                    <p className="font-mono text-xs text-cyan-400">{commit.sha}</p>
                                    <p className="text-sm font-semibold truncate">{commit.message}</p>
                                    <p className="text-xs text-gray-400">{commit.author} on {new Date(commit.date).toLocaleDateString()}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Commit Detail / Diff Viewer */}
                    <div className="w-3/5 flex flex-col bg-gray-900/50 p-3 rounded-lg border border-gray-700 space-y-3">
                        {selectedCommit ? (
                            <>
                                <div className="flex-shrink-0">
                                    <p className="text-gray-400">Commit: <span className="font-mono text-cyan-300">{selectedCommit.sha}</span></p>
                                    <p className="text-gray-400">Author: <span className="font-semibold text-gray-200">{selectedCommit.author}</span></p>
                                    <p className="text-gray-400">Date: <span className="font-semibold text-gray-200">{selectedCommit.date}</span></p>
                                </div>
                                <div className="flex-1 flex flex-col min-h-0">
                                    <h4 className="text-md font-semibold mb-2 text-gray-300 flex-shrink-0">Changes</h4>
                                    <div className="flex-1 bg-gray-800 p-2 rounded overflow-y-auto font-mono text-sm border border-gray-600">
                                        {selectedCommit.diff.split('\n').map((line, index) => (
                                            <DiffLine key={index} line={line} />
                                        ))}
                                    </div>
                                </div>
                                <div className="flex-shrink-0 flex items-center space-x-2">
                                    <button onClick={handleRevert} className="bg-red-600 hover:bg-red-700 text-white font-bold py-1.5 px-3 rounded text-sm transition">Revert to this Commit</button>
                                    <button className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-1.5 px-3 rounded text-sm transition disabled:opacity-50" disabled>Create Branch...</button>
                                </div>
                            </>
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-500">Select a commit to view details</div>
                        )}
                    </div>
                </div>

                {/* Bottom Settings */}
                <div className="flex-shrink-0 bg-gray-900/50 p-3 rounded-lg border border-gray-700 space-y-3">
                    <h3 className="text-md font-semibold text-gray-300">GitHub Integration & Backup Settings</h3>
                    <div className="text-sm text-gray-500">Integration and backup settings will appear here. (Not implemented)</div>
                </div>
            </div>
        </div>
    );
};

export default VersioningPanel;