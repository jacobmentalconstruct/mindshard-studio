
import React, { useEffect } from 'react';
import { useAppStore } from '../stores/appStore';
import { BrainCircuitIcon, CpuChipIcon } from './Icons';
import { SystemMetrics, SystemStatus } from '../types';
import { useSystemMetricsQuery, useSystemStatusQuery } from '../hooks/queries';
import useTauriStore from '../hooks/useTauriStore';

const ResourceDisplay: React.FC<{ metrics: SystemMetrics | null }> = ({ metrics }) => {
    if (!metrics) return null;

    const renderMetric = (label: string, value: number | undefined) => {
        if (value === undefined) return null;
        const color = value > 85 ? 'text-red-400' : value > 60 ? 'text-yellow-400' : 'text-green-400';
        return (
            <div className="flex items-center space-x-1">
                <span className="text-gray-400 font-medium">{label}:</span>
                <span className={`font-mono font-bold ${color}`}>{value.toFixed(0)}%</span>
            </div>
        );
    };

    return (
        <div className="flex items-center space-x-4 bg-gray-900/50 px-4 py-1.5 rounded-lg border border-gray-700 text-xs">
            <CpuChipIcon className="h-5 w-5 text-gray-400" />
            {renderMetric("CPU", metrics.cpu_usage)}
            <div className="w-px h-4 bg-gray-600" />
            {renderMetric("RAM", metrics.memory_usage)}
            {metrics.gpu_usage !== undefined && (
                <>
                    <div className="w-px h-4 bg-gray-600" />
                    {renderMetric("GPU", metrics.gpu_usage)}
                </>
            )}
        </div>
    );
};

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
  const { setSystemStatus, setMetrics } = useAppStore(state => ({
      setSystemStatus: state.setSystemStatus,
      setMetrics: state.setMetrics,
  }));
  const [selectedModel] = useTauriStore('mindshard-selected-model', '');
  
  const { data: statusData } = useSystemStatusQuery();
  const { data: metricsData } = useSystemMetricsQuery();

  useEffect(() => {
      if(statusData) setSystemStatus(statusData);
  }, [statusData, setSystemStatus]);
  
  useEffect(() => {
      if(metricsData) setMetrics(metricsData);
  }, [metricsData, setMetrics]);

  return (
    <header className="bg-gray-800/95 border-b border-gray-700 p-3 flex items-center shadow-md flex-shrink-0">
      <div className="flex items-center space-x-4">
        <BrainCircuitIcon className="h-8 w-8 text-cyan-400" />
        <h1 className="text-xl font-bold text-white tracking-wider">Mindshard Studio</h1>
      </div>

      <div className="flex-grow" />

      <div className="flex items-center space-x-4">
        <ModelStatusDisplay status={statusData || null} modelName={selectedModel} />
        <ResourceDisplay metrics={metricsData || null} />
      </div>
    </header>
  );
};

export default NavBar;