import React, { useState, useCallback, useMemo } from 'react';
import { Status } from './types';
import LoaderItem from './components/LoaderItem';
import { RocketIcon, SaveIcon, FolderIcon } from './components/Icons';

interface LoadingState {
  vite: Status;
  localServer: Status;
  network: Status;
}

const INITIAL_STATE: LoadingState = {
  vite: Status.IDLE,
  localServer: Status.IDLE,
  network: Status.IDLE,
};

const App: React.FC = () => {
  const [statuses, setStatuses] = useState<LoadingState>(INITIAL_STATE);
  const [isLoading, setIsLoading] = useState(false);
  
  const handleStartServer = useCallback(async () => {
    setIsLoading(true);
    setStatuses(INITIAL_STATE);

    // Simulate VITE starting up
    setStatuses(prev => ({ ...prev, vite: Status.LOADING }));
    await new Promise(resolve => setTimeout(resolve, 800)); // Simulate work
    setStatuses(prev => ({ ...prev, vite: Status.SUCCESS }));
    
    // Simulate Local server becoming available
    setStatuses(prev => ({ ...prev, localServer: Status.LOADING }));
    await new Promise(resolve => setTimeout(resolve, 400));
    setStatuses(prev => ({ ...prev, localServer: Status.SUCCESS }));

    // Simulate Network exposure
    setStatuses(prev => ({ ...prev, network: Status.LOADING }));
    await new Promise(resolve => setTimeout(resolve, 500));
    setStatuses(prev => ({ ...prev, network: Status.SUCCESS }));

    setIsLoading(false);
  }, []);

  const handleOpenStudio = useCallback(() => {
    // In a real app, this would open a new window or navigate
    console.log('Opening AI Studio at http://localhost:5173/...');
    window.open('http://localhost:5173/', '_blank');
  }, []);

  const allDone = useMemo(() => {
    return Object.values(statuses).every(s => s === Status.SUCCESS);
  }, [statuses]);

  const mainButtonAction = allDone ? handleOpenStudio : handleStartServer;

  const mainButtonText = useMemo(() => {
    if (isLoading) return 'Launching...';
    if (allDone) return 'Open Studio';
    return 'Start Server';
  }, [isLoading, allDone]);

  return (
    <div className="bg-slate-900/70 backdrop-blur-md text-white p-4 rounded-xl shadow-2xl shadow-slate-900/50 w-full max-w-xs mx-auto border border-slate-700">
      <div className="flex flex-col space-y-4">
        <header className="text-center">
            <h1 className="text-lg font-bold text-slate-100">AI Studio Loader</h1>
            <p className="text-xs text-slate-400">Monitoring startup sequence...</p>
        </header>

        <div className="space-y-3">
          <div>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">Core Services</h2>
            <LoaderItem label="Vite Dev Server" status={statuses.vite} details="VITE v7.0.5 ready" />
          </div>
          
          <div>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">Access Points</h2>
            <div className="space-y-2">
                <LoaderItem label="Local Access" status={statuses.localServer} details="http://localhost:5173/" />
                <LoaderItem label="Network Access" status={statuses.network} details="use --host to expose" />
            </div>
          </div>
        </div>
        
        <div className="pt-2 space-y-3">
           <button 
             onClick={mainButtonAction} 
             disabled={isLoading}
             className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-lg transition-all duration-300 ease-in-out
               ${isLoading 
                 ? 'bg-slate-600 text-slate-400 cursor-not-allowed' 
                 : allDone 
                 ? 'bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/20'
                 : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/30'
               }`}
           >
            <RocketIcon className={`w-5 h-5 transition-transform duration-500 ${isLoading ? 'animate-pulse' : ''} ${allDone ? 'rotate-12' : ''}`} />
            <span>{mainButtonText}</span>
           </button>
           <div className="flex items-center gap-2">
                <button
                    disabled={!allDone}
                    onClick={() => console.log('Save Log clicked')}
                    className="w-1/2 flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-700/70 hover:bg-slate-700 text-slate-300 transition-colors disabled:bg-slate-800/50 disabled:text-slate-500 disabled:cursor-not-allowed"
                >
                    <SaveIcon className="w-4 h-4" />
                    <span>Save Log</span>
                </button>
                <button
                    disabled={!allDone}
                    onClick={() => console.log('Open Log Dir clicked')}
                    className="w-1/2 flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-700/70 hover:bg-slate-700 text-slate-300 transition-colors disabled:bg-slate-800/50 disabled:text-slate-500 disabled:cursor-not-allowed"
                >
                    <FolderIcon className="w-4 h-4" />
                    <span>Open Log Dir</span>
                </button>
           </div>
        </div>
      </div>
    </div>
  );
};

export default App;