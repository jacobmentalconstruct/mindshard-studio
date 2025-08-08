
import React, { useState, useEffect, useRef } from 'react';
import FrameBox from '../FrameBox';
import useTauriStore from '../../hooks/useTauriStore';

interface LogEntry {
  timestamp: string;
  message: string;
}

const MemoryDebugStreamPanel: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dummyMessages = [
      "Memory index updated with chunk X",
      "Recall triggered for query Y – 3 results returned",
      "Memory manager: cache cleared",
      "Ingested 5 files into vector index",
      "Analyzed document 'design_spec.pdf'",
      "Committing scratchpad to long-term memory"
    ];

    const intervalId = setInterval(() => {
      setLogs(prevLogs => [
        ...prevLogs,
        {
          timestamp: new Date().toLocaleTimeString(),
          message: dummyMessages[Math.floor(Math.random() * dummyMessages.length)]
        }
      ]);
    }, 3000); // Add a new log every 3 seconds

    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  const handleClearLog = () => {
    setLogs([]);
  };

  return (
    <FrameBox 
      title="Memory Debug Stream"
    >
      <div className="flex flex-col h-full">
        <div className="flex justify-end mb-2">
          <button
            onClick={handleClearLog}
            className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-1 px-3 rounded text-sm transition"
          >
            Clear Log
          </button>
        </div>
        <div
          ref={logContainerRef}
          className="flex-1 bg-gray-900/80 p-3 rounded font-mono text-sm overflow-y-auto"
        >
          {logs.map((log, index) => (
            <div key={index} className="whitespace-pre-wrap">
              <span className="text-cyan-400">[{log.timestamp}]</span>
              <span className="text-gray-300 ml-2">{log.message}</span>
            </div>
          ))}
          {logs.length === 0 && <p className="text-gray-500">Waiting for debug messages...</p>}
        </div>
      </div>
    </FrameBox>
  );
};

export default MemoryDebugStreamPanel;