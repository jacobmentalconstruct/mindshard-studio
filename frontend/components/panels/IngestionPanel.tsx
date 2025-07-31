

import React, { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { KnowledgeBase, OcrOptions } from '../../types';
import { getKnowledgeBases, createKnowledgeBase, ingestFilesWithOcr, deleteKnowledgeBase } from '../../services/mindshardService';
import { ApiKeyContext, KnowledgeContext } from '../../App';
import FrameBox from '../FrameBox';
import { TrashIcon, PlusIcon, DocumentTextIcon, ChevronLeftIcon, ChevronRightIcon, FileIcon, GlobeAltIcon } from '../Icons';

export const IngestionPanel: React.FC = () => {
  const { apiKey } = useContext(ApiKeyContext);
  const { targetKbId, setTargetKbId } = useContext(KnowledgeContext);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [ingestionMessage, setIngestionMessage] = useState('');
  
  const [isDragging, setIsDragging] = useState(false);
  const [filesToIngest, setFilesToIngest] = useState<File[]>([]);
  const [selectedFileForPreview, setSelectedFileForPreview] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchKbs = useCallback(() => {
    if (!apiKey) return;
    getKnowledgeBases(apiKey).then(kbs => {
      setKnowledgeBases(kbs);
      if (kbs.length > 0 && (!targetKbId || !kbs.some(kb => kb.id === targetKbId))) {
        setTargetKbId(kbs[0].id);
      } else if (kbs.length === 0) {
        setTargetKbId(null);
      }
    });
  }, [apiKey, targetKbId, setTargetKbId]);

  useEffect(() => {
    fetchKbs();
  }, [apiKey]);

  const handleCreateKb = async () => {
    const name = prompt("Enter new Knowledge Base name:");
    if (name && apiKey) {
        const newKb = await createKnowledgeBase(apiKey, name);
        fetchKbs();
        setTargetKbId(newKb.id);
    }
  };

  const handleDeleteKb = async (kbId: string, kbName: string) => {
    if (!apiKey || !window.confirm(`Are you sure you want to delete the "${kbName}" knowledge base? This action cannot be undone.`)) return;
    await deleteKnowledgeBase(apiKey, kbId);
    fetchKbs();
  };

  const selectedKbDetails = knowledgeBases.find(kb => kb.id === targetKbId);

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const newFiles = Array.from(e.dataTransfer.files);
      setFilesToIngest(prev => [...prev, ...newFiles]);
      if (!selectedFileForPreview) {
        setSelectedFileForPreview(newFiles[0]);
      }
    }
  };
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
          const newFiles = Array.from(e.target.files);
          setFilesToIngest(prev => [...prev, ...newFiles]);
          if (!selectedFileForPreview) {
            setSelectedFileForPreview(newFiles[0]);
          }
      }
  };
  
  useEffect(() => {
    if (selectedFileForPreview) {
        const objectUrl = URL.createObjectURL(selectedFileForPreview);
        setPreviewUrl(objectUrl);
        setCurrentPage(1);
        if (selectedFileForPreview.type === 'application/pdf') {
            setTotalPages(5); // Mock value for PDFs
        } else {
            setTotalPages(1);
        }
        return () => URL.revokeObjectURL(objectUrl);
    } else {
        setPreviewUrl(null);
    }
  }, [selectedFileForPreview]);

  const removeFileFromQueue = (fileToRemove: File) => {
    const remainingFiles = filesToIngest.filter(f => f !== fileToRemove);
    setFilesToIngest(remainingFiles);
    if (selectedFileForPreview === fileToRemove) {
      setSelectedFileForPreview(remainingFiles.length > 0 ? remainingFiles[0] : null);
    }
  };
  
  const readFileAsBase64 = (file: File): Promise<{name: string, content: string}> => {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const base64String = (reader.result as string).split(',')[1];
            resolve({ name: file.name, content: base64String });
          }
          reader.onerror = error => reject(error);
          reader.readAsDataURL(file);
      });
  };

  const handleIngestAndOcr = async () => {
      if (!apiKey || !targetKbId || filesToIngest.length === 0) {
          setIngestionMessage('API Key, Target KB, and files are required.');
          return;
      }
      setIngestionMessage(`Processing ${filesToIngest.length} file(s)...`);
      
      try {
          const fileContents = await Promise.all(filesToIngest.map(readFileAsBase64));
          await ingestFilesWithOcr(apiKey, fileContents, targetKbId, { lang: 'eng', layout: 'auto', dpi: 300, engine: 'tesseract', ocr: true });
          setIngestionMessage(`Successfully ingested ${filesToIngest.length} file(s).`);
          setFilesToIngest([]);
          setSelectedFileForPreview(null);
      } catch (error) {
          setIngestionMessage('An error occurred during ingestion.');
          console.error(error);
      } finally {
          setTimeout(() => setIngestionMessage(''), 4000);
      }
  };

  return (
    <div className="p-4 flex flex-col h-full">
        <h2 className="text-xl font-bold text-gray-300 border-b border-gray-700 pb-2 mb-4 flex-shrink-0">Ingestion</h2>
        <div className="flex flex-col h-full space-y-4">
            
            <div className="flex space-x-4 flex-shrink-0">
                <div className="w-1/2 bg-gray-900/50 p-3 rounded-lg border border-gray-700 flex flex-col">
                    <div className="flex justify-between items-center mb-2">
                        <h3 className="text-md font-semibold text-gray-300">Knowledge Bases</h3>
                        <button onClick={handleCreateKb} className="flex items-center space-x-1 text-sm bg-cyan-600 hover:bg-cyan-700 px-2 py-1 rounded">
                            <PlusIcon className="h-4 w-4" />
                            <span>New</span>
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-1 pr-1">
                        {knowledgeBases.map(kb => (
                            <button 
                                key={kb.id} 
                                onClick={() => setTargetKbId(kb.id)}
                                className={`w-full text-left p-2 text-sm rounded transition-colors ${targetKbId === kb.id ? 'bg-cyan-500/80 text-white' : 'bg-gray-800 hover:bg-gray-700'}`}
                            >
                                {kb.name}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="w-1/2 bg-gray-900/50 p-3 rounded-lg border border-gray-700 flex flex-col">
                    <h3 className="text-md font-semibold text-gray-300 mb-2">Details</h3>
                    {selectedKbDetails ? (
                        <div className="flex-1 overflow-y-auto pr-1 space-y-3">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h4 className="font-bold text-lg text-cyan-400">{selectedKbDetails.name}</h4>
                                    <p className="text-xs text-gray-400">{selectedKbDetails.contentCount} sources</p>
                                </div>
                                {!selectedKbDetails.system && (
                                     <button onClick={() => handleDeleteKb(selectedKbDetails.id, selectedKbDetails.name)} className="p-1.5 text-red-500 hover:text-red-400 rounded-full hover:bg-red-900/50 transition-colors"><TrashIcon className="h-4 w-4"/></button>
                                )}
                            </div>
                            <div className="space-y-1">
                                <h5 className="text-sm font-semibold text-gray-400">Sources:</h5>
                                <div className="text-xs text-gray-300 space-y-1">
                                    {selectedKbDetails.sources && selectedKbDetails.sources.length > 0 
                                        ? selectedKbDetails.sources.map(s => (
                                            <div key={s.id} className="flex items-center space-x-2 bg-gray-800 p-1 rounded">
                                                {s.type === 'file' ? <FileIcon className="h-4 w-4 text-gray-400" /> : <GlobeAltIcon className="h-4 w-4 text-cyan-400" />}
                                                <span className="truncate">{s.name}</span>
                                            </div>
                                        )) 
                                        : <p className="text-gray-500">No sources ingested yet.</p>}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-500">Select a KB to see details.</div>
                    )}
                </div>
            </div>

            <div className="bg-gray-900/70 p-3 rounded-lg border border-gray-700 space-y-3 flex-1 flex flex-col">
                <h3 className="text-md font-semibold text-gray-300 border-b border-gray-600 pb-2 flex-shrink-0">Image & PDF Ingestion</h3>
                
                <div className="flex-1 flex space-x-4 min-h-0">
                    <div className="w-1/3 flex flex-col">
                        <h4 className="text-sm font-semibold text-gray-400 mb-2">Ingestion Queue ({filesToIngest.length})</h4>
                        <div 
                            className={`flex-1 border-2 border-dashed rounded-lg text-center cursor-pointer transition-colors flex flex-col ${isDragging ? 'border-cyan-400 bg-cyan-900/20' : 'border-gray-600 hover:border-gray-500'}`}
                            onDragOver={(e) => {e.preventDefault(); e.stopPropagation(); setIsDragging(true);}}
                            onDragEnter={(e) => {e.preventDefault(); e.stopPropagation(); setIsDragging(true);}}
                            onDragLeave={(e) => {e.preventDefault(); e.stopPropagation(); setIsDragging(false);}}
                            onDrop={handleFileDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileSelect} accept=".png,.jpg,.jpeg,.tiff,.pdf"/>
                             <div className="flex-grow overflow-y-auto p-2 space-y-1">
                                {filesToIngest.length > 0 ? filesToIngest.map((file, index) => (
                                    <div 
                                        key={index} 
                                        className={`flex items-center justify-between p-1.5 rounded text-sm cursor-pointer ${selectedFileForPreview === file ? 'bg-cyan-500/30' : 'bg-gray-800 hover:bg-gray-700/50'}`}
                                        onClick={(e) => { e.stopPropagation(); setSelectedFileForPreview(file); }}
                                    >
                                       <span className="truncate">{file.name}</span>
                                       <button onClick={(e) => { e.stopPropagation(); removeFileFromQueue(file);}} className="p-1 text-red-500 hover:text-red-400 flex-shrink-0"><TrashIcon className="h-4 w-4"/></button>
                                    </div>
                                )) : (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                        <p>Drop files here</p>
                                        <p className="text-xs">or click to browse</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="w-2/3 flex flex-col bg-gray-900/80 rounded-lg">
                        {previewUrl && selectedFileForPreview ? (
                            <div className="flex-1 flex flex-col p-2 min-h-0">
                                <div className="flex-grow flex items-center justify-center bg-black/30 rounded-md overflow-hidden">
                                     {selectedFileForPreview.type.startsWith('image/') ? (
                                        <img src={previewUrl} alt="Preview" className="max-h-full max-w-full object-contain" />
                                     ) : (
                                        <div className="text-center text-gray-400">
                                            <DocumentTextIcon className="h-24 w-24 mx-auto text-gray-500" />
                                            <h3 className="text-lg mt-4">{selectedFileForPreview.name}</h3>
                                            <p className="text-sm">PDF Preview</p>
                                        </div>
                                     )}
                                </div>
                                <div className="flex-shrink-0 flex items-center justify-center space-x-4 pt-2">
                                     <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} className="p-1 rounded-full bg-gray-700 hover:bg-gray-600 disabled:opacity-50"><ChevronLeftIcon className="h-5 w-5"/></button>
                                     <span className="text-sm font-mono">Page {currentPage} of {totalPages}</span>
                                     <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="p-1 rounded-full bg-gray-700 hover:bg-gray-600 disabled:opacity-50"><ChevronRightIcon className="h-5 w-5"/></button>
                                </div>
                            </div>
                        ) : (
                             <div className="flex items-center justify-center h-full text-gray-500">Select a file from the queue to preview</div>
                        )}
                    </div>
                </div>

                <div className="flex-shrink-0 flex items-center justify-between pt-2">
                    {ingestionMessage ? (
                         <span className="text-sm text-cyan-300">{ingestionMessage}</span>
                    ) : (
                        <span></span>
                    )}
                    <button 
                        onClick={handleIngestAndOcr} 
                        disabled={filesToIngest.length === 0 || !targetKbId}
                        className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition disabled:bg-gray-500 disabled:cursor-not-allowed"
                    >
                        Ingest {filesToIngest.length > 0 ? `(${filesToIngest.length})` : ''}
                    </button>
                </div>
            </div>

        </div>
    </div>
  );
};