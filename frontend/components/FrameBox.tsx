
import React, { useState } from 'react';
import { ChevronRightIcon, BrainCircuitIcon } from './Icons';

interface FrameBoxProps {
  title: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  agentAware?: boolean;
  onToggleAgentAware?: () => void;
}

const FrameBox: React.FC<FrameBoxProps> = ({ title, children, defaultExpanded = true, agentAware, onToggleAgentAware }) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg shadow-lg flex flex-col h-full">
      <header
        className="flex items-center justify-between p-3 border-b border-gray-700 cursor-pointer bg-gray-800/80 rounded-t-lg"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-3 flex-grow min-w-0">
          <h3 className="font-semibold text-gray-200 truncate">{title}</h3>
           {onToggleAgentAware !== undefined && (
             <button
                onClick={(e) => {
                    e.stopPropagation();
                    onToggleAgentAware();
                }}
                title={agentAware ? "The AI agent is aware of this panel's context." : "The AI agent is NOT aware of this panel's context."}
                className={`p-1 rounded-full transition-colors ${agentAware ? 'text-cyan-400 bg-cyan-900/50 hover:bg-cyan-800/50' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700'}`}
             >
                <BrainCircuitIcon className="h-4 w-4" />
             </button>
          )}
        </div>

        <button 
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          className="text-gray-400 hover:text-white transition-transform duration-200 flex-shrink-0 ml-2" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      </header>
      {isExpanded && (
        <div className="p-2 overflow-y-auto flex-1 bg-gray-800/50">
          {children}
        </div>
      )}
    </div>
  );
};

export default FrameBox;
