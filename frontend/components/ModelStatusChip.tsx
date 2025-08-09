// File: frontend/components/ModelStatusChip.tsx
import React from 'react';
import { useAppStore } from '@/stores/appStore';
import { RefreshIcon } from '@/components/Icons';
import LoadingSpinner from '@/components/common/LoadingSpinner';

export const ModelStatusChip: React.FC = () => {
  const { modelStatus, reloadModel } = useAppStore((state) => ({
    modelStatus: state.modelStatus,
    reloadModel: state.reloadModel,
  }));

  const handleReload = () => {
    // We call reloadModel without arguments to use the settings currently in the store.
    reloadModel().catch(console.error);
  };

  const getStatusContent = () => {
    if (!modelStatus) {
      return {
        bgColor: 'bg-gray-600',
        textColor: 'text-gray-200',
        dotColor: 'bg-gray-400',
        text: 'Status Unknown',
        action: (
          <button onClick={handleReload} title="Refresh Status">
            <RefreshIcon className="h-4 w-4 text-gray-400 hover:text-white" />
          </button>
        ),
      };
    }

    switch (modelStatus.status) {
      case 'loaded':
        return {
          bgColor: 'bg-green-800/50 border-green-600',
          textColor: 'text-green-300',
          dotColor: 'bg-green-400',
          text: 'Model Loaded',
          modelName: modelStatus.name || modelStatus.model_path.split(/[\\/]/).pop(),
        };
      case 'loading':
        return {
          bgColor: 'bg-yellow-800/50 border-yellow-600',
          textColor: 'text-yellow-300',
          dotColor: 'bg-yellow-400 animate-pulse',
          text: 'Model is Loading...',
          icon: <LoadingSpinner size="sm" />,
        };
      case 'not_loaded':
      default:
        return {
          bgColor: 'bg-red-800/50 border-red-600',
          textColor: 'text-red-300',
          dotColor: 'bg-red-400',
          text: 'Model Not Loaded',
          action: (
            <button onClick={handleReload} title="Attempt to Reload Model" className="text-xs bg-red-900/80 hover:bg-red-800/80 px-2 py-0.5 rounded">
              Reload
            </button>
          ),
        };
    }
  };

  const { bgColor, textColor, dotColor, text, modelName, icon, action } = getStatusContent();

  return (
    <div className={`flex items-center space-x-3 px-3 py-1.5 rounded-full border text-xs font-medium ${bgColor} ${textColor}`}>
      <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`}></div>
      <div className="flex-grow">
        <span className="font-semibold">{text}</span>
        {modelName && <span className="ml-2 opacity-80 font-mono truncate" title={modelName}>{modelName}</span>}
      </div>
      {icon && <div>{icon}</div>}
      {action && <div>{action}</div>}
    </div>
  );
};

// This makes it the default export, fixing the error in App.tsx
export default ModelStatusChip;