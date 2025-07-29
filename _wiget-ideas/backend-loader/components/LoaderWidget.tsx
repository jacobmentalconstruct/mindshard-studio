import React, { useState, useCallback, useEffect } from 'react';
import { getInitialLoadingState, LOG_STREAM } from '../constants';
import { LoadingGroup, LoadingStatus } from '../types';
import LoadingItemComponent from './LoadingItem';
import { PlayIcon, ArrowPathIcon, SaveIcon, FolderIcon } from './icons/ActionIcons';

const LoaderWidget: React.FC = () => {
  const [loadingGroups, setLoadingGroups] = useState<LoadingGroup[]>(getInitialLoadingState());
  const [isProcessing, setIsProcessing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const resetState = useCallback(() => {
    setLoadingGroups(getInitialLoadingState());
    setIsProcessing(false);
    setIsComplete(false);
  }, []);

  const handleLoadServer = useCallback(() => {
    if (isProcessing) return;

    resetState();
    setIsProcessing(true);

    let logIndex = 0;
    const interval = setInterval(() => {
      if (logIndex >= LOG_STREAM.length) {
        clearInterval(interval);
        setIsProcessing(false);
        setIsComplete(true);
        return;
      }

      const logLine = LOG_STREAM[logIndex];

      setLoadingGroups(prevGroups => {
        return prevGroups.map(group => ({
          ...group,
          items: group.items.map(item => {
            if (item.status !== LoadingStatus.COMPLETED) {
              if (item.startLog && logLine.includes(item.startLog)) {
                return { ...item, status: LoadingStatus.LOADING };
              }
              if (logLine.includes(item.endLog)) {
                return { ...item, status: LoadingStatus.COMPLETED };
              }
            }
            return item;
          }),
        }));
      });

      logIndex++;
    }, 150); // Simulate log stream speed
  }, [isProcessing, resetState]);
  
  const allItemsComplete = loadingGroups.every(g => g.items.every(i => i.status === LoadingStatus.COMPLETED));

  useEffect(() => {
    if (allItemsComplete) {
      setIsProcessing(false);
      setIsComplete(true);
    }
  }, [loadingGroups, allItemsComplete]);


  return (
    <div className="w-full max-w-md bg-slate-900/70 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl shadow-blue-500/10 flex flex-col">
      <header className="p-4 border-b border-slate-800 flex justify-between items-center">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Mindshard Studio</h1>
          <p className="text-sm text-slate-400">Local AI Server Status</p>
        </div>
         <div className={`px-3 py-1 text-xs font-medium rounded-full ${
            isProcessing ? 'bg-blue-500/20 text-blue-300' :
            isComplete ? 'bg-green-500/20 text-green-300' :
            'bg-slate-700/50 text-slate-300'
          }`}>
          {isProcessing ? 'Loading...' : isComplete ? 'Ready' : 'Idle'}
        </div>
      </header>

      <div className="p-4 space-y-3 flex-grow overflow-y-auto max-h-[60vh]">
        {loadingGroups.map(group => (
          <div key={group.name}>
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{group.name}</h2>
            <div className="space-y-1">
              {group.items.map(item => (
                <LoadingItemComponent key={item.id} {...item} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <footer className="p-4 border-t border-slate-800 space-y-3">
        <button
          onClick={isComplete ? resetState : handleLoadServer}
          disabled={isProcessing}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-500 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 disabled:scale-100"
        >
          {isComplete ? (
             <>
              <ArrowPathIcon />
              Reset
            </>
          ) : isProcessing ? (
            <>
              <svg className="animate-spin -ml-1 mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Loading Server...
            </>
          ) : (
            <>
              <PlayIcon />
              Load Server
            </>
          )}
        </button>
        <div className="flex items-center gap-3">
            <button
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 font-semibold rounded-lg hover:bg-slate-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isProcessing}
              aria-label="Save Log"
            >
              <SaveIcon />
              Save Log
            </button>
            <button
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 text-slate-300 font-semibold rounded-lg hover:bg-slate-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isProcessing}
              aria-label="Open Log Directory"
            >
              <FolderIcon />
              Open Log Dir
            </button>
        </div>
      </footer>
    </div>
  );
};

export default LoaderWidget;