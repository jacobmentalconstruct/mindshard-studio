import React, { useState, useEffect } from 'react';
import { getFileTree } from '../../services/mindshardService';
import { FileNode } from '../../types';
import { FolderIcon, ChevronRightIcon } from '../Icons';

interface DirectoryNodeProps {
    node: FileNode;
    onSelect: (path: string) => void;
    basePath: string | null;
}

const DirectoryNode: React.FC<DirectoryNodeProps> = ({ node, onSelect, basePath }) => {
    const [isOpen, setIsOpen] = useState(node.path === basePath || !basePath);

    if (node.type !== 'directory') return null;

    return (
        <div className="ml-4 my-1">
            <div className="flex items-center group">
                {node.children && node.children.some(c => c.type === 'directory') && (
                    <ChevronRightIcon
                        className={`h-4 w-4 mr-1 cursor-pointer transition-transform flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`}
                        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}
                    />
                )}
                <FolderIcon className="h-5 w-5 mr-2 text-cyan-400 flex-shrink-0" />
                <button
                    onClick={(e) => { e.stopPropagation(); onSelect(node.path); }}
                    className="text-left text-sm text-gray-300 hover:text-white hover:underline truncate p-1 rounded group-hover:bg-gray-700/50"
                >
                    {node.name}
                </button>
            </div>
            {isOpen && node.children && (
                <div className="border-l border-gray-700 pl-2">
                    {node.children.map(child => (
                        <DirectoryNode key={child.id} node={child} onSelect={onSelect} basePath={basePath} />
                    ))}
                </div>
            )}
        </div>
    );
};


interface FolderPickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (path: string) => void;
    initialPath?: string | null;
}

const FolderPickerModal: React.FC<FolderPickerModalProps> = ({ isOpen, onClose, onSelect, initialPath = null }) => {
    const [tree, setTree] = useState<FileNode | null>(null);
    const [selectedPath, setSelectedPath] = useState<string>(initialPath || '');

    useEffect(() => {
        if (isOpen) {
            getFileTree(null).then(setTree).catch(console.error);
            setSelectedPath(initialPath || '');
        }
    }, [isOpen, initialPath]);
    
    const handleSelectAndClose = () => {
        onSelect(selectedPath);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onMouseDown={onClose}>
            <div className="bg-gray-800 border border-gray-600 rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col" onMouseDown={e => e.stopPropagation()}>
                <h3 className="text-lg font-semibold p-4 border-b border-gray-700 flex-shrink-0">Select a Folder</h3>
                <div className="overflow-y-auto p-4 flex-grow bg-gray-900/50">
                    {tree ? (
                        <DirectoryNode node={tree} onSelect={setSelectedPath} basePath={initialPath}/>
                    ) : (
                        <p className="text-gray-400">Loading project structure...</p>
                    )}
                </div>
                <div className="p-2 border-b border-t border-gray-700 text-sm flex-shrink-0">
                    <span className="text-gray-400 px-3">Selected:</span>
                    <span className="font-mono text-cyan-300">{selectedPath}</span>
                </div>
                <div className="p-4 border-t border-gray-700 flex-shrink-0 flex justify-end space-x-3">
                    <button onClick={onClose} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded transition">
                        Cancel
                    </button>
                    <button onClick={handleSelectAndClose} className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-2 px-4 rounded transition">
                        Select Folder
                    </button>
                </div>
            </div>
        </div>
    );
};

export default FolderPickerModal;
