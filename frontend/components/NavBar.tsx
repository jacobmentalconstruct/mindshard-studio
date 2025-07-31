
import React, { useContext, useEffect, useState } from 'react';
import useLocalStorage from '../hooks/useLocalStorage';
import { ApiKeyContext } from '../App';
import { BrainCircuitIcon, ArrowDownTrayIcon, ArrowUpTrayIcon, XCircleIcon, CpuChipIcon } from './Icons';
import { SystemMetrics, SystemStatus } from '../types';
import { getSystemMetrics, getSystemStatus } from '../services/mindshardService';

const ModelStatusDisplay: React.FC<{ status: SystemStatus | null, modelName: string | null }> = ({ status, modelName }) => {
    if (!status) return null;
    
    const statusColor = status.model_status === 'loaded' ? 'bg-green-400' : status.model_status === 'loading' ? 'bg-yellow-400 animate-pulse' : 'bg-red-400';
    const statusText = status.model_status.charAt(0).toUpperCase() + status.model_status.slice(1);

    return (
        <div className="flex items-center space-x-3 bg-gray-900/50 px-4 py-1.5 rounded-lg border border-gray-700 text-xs">
            <div className="flex items-center space-x-2">
                 <span className={`w-3 h-3 rounded-full ${statusColor}`}></span>
                 <span className="font-semibold text-gray-300">{statusText}</span>
            </div>
            <div className="w-px h-4 bg-gray-600" />
            <span className="text-gray-400 font-medium truncate max-w-[200px]" title={modelName ?? 'No model selected'}>{modelName || 'No Model Selected'}</span>
        </div>
    );
}

const NavBar: React.FC = () => {
  const { apiKey, setApiKey } = useContext(ApiKeyContext);
  const [localApiKey, setLocalApiKey] = useLocalStorage('mindshard-api-key', '');
  const [selectedModel] = useLocalStorage('mindshard-selected-model', '');
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);

  useEffect(() => {
    setApiKey(localApiKey);
  }, [localApiKey, setApiKey]);
  
  useEffect(() => {
    console.log("NavBar trying to fetch data with apiKey:", apiKey);
    
    if (!apiKey) return;
    
    const fetchData = () => {
        getSystemStatus(apiKey).then(setSystemStatus).catch(console.error);
    };

    fetchData(); // Initial fetch
    const intervalId = setInterval(fetchData, 2000);

    return () => clearInterval(intervalId);
  }, [apiKey]);


  return (
    <header className="bg-gray-800/95 border-b border-gray-700 p-3 flex items-center shadow-md flex-shrink-0">
      <div className="flex items-center space-x-4">
        <BrainCircuitIcon className="h-8 w-8 text-cyan-400" />
        <h1 className="text-xl font-bold text-white tracking-wider">Mindshard Studio</h1>
      </div>

      <div className="flex-grow" />

      <div className="flex items-center space-x-4">
        <ModelStatusDisplay status={systemStatus} modelName={selectedModel} />
        <div className="w-px h-6 bg-gray-600" />
        <div className="flex items-center space-x-2">
            <button className="flex items-center space-x-2 bg-red-700/50 hover:bg-red-600/50 text-gray-300 px-3 py-1.5 rounded-md text-sm transition-colors">
                <XCircleIcon className="h-5 w-5"/>
                <span>Close</span>
            </button>
        </div>
      </div>
    </header>
  );
};

export default NavBar;