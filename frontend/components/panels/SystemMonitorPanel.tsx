

import React, { useState, useEffect, useContext, useMemo, useRef } from 'react';
import FrameBox from '../FrameBox';
import { ApiKeyContext } from '../../App';
import { SystemMetrics, PerformanceKPIs, BackendLogEntry, LogLevel, SystemStatus } from '../../types';
import { getSystemMetrics, getPerformanceKpis, getBackendLogs, getSystemStatus } from '../../services/mindshardService';
import useLocalStorage from '../../hooks/useLocalStorage';
import { ChevronDownIcon, Cog6ToothIcon } from '../Icons';

const ResourceGauge: React.FC<{ label: string; value: number }> = ({ label, value }) => {
    const colorClass = value > 85 ? 'bg-red-500' : value > 60 ? 'bg-yellow-500' : 'bg-green-500';
    return (
        <div>
            <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-300">{label}</span>
                <span className="font-bold text-gray-200">{value.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2.5">
                <div className={`${colorClass} h-2.5 rounded-full transition-all duration-300`} style={{ width: `${value}%` }}></div>
            </div>
        </div>
    );
};

const ProgressBar: React.FC<{ label: string; value: number; max: number }> = ({ label, value, max }) => {
    const percentage = max > 0 ? (value / max) * 100 : 0;
    const colorClass = percentage > 85 ? 'bg-red-500' : percentage > 60 ? 'bg-yellow-500' : 'bg-cyan-500';
    return (
        <div>
            <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-300">{label}</span>
                <span className="font-mono text-gray-200">{value} / {max}</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-4">
                <div className={`${colorClass} h-4 rounded-full transition-all duration-300 flex items-center justify-center text-xs font-bold`} style={{ width: `${percentage}%` }}>
                    {percentage.toFixed(0)}%
                </div>
            </div>
        </div>
    );
};

const KpiCard: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
    <div className="bg-gray-700/50 p-4 rounded-lg text-center">
        <div className="text-2xl font-bold text-cyan-400">{value}</div>
        <div className="text-sm text-gray-400">{label}</div>
    </div>
);

const getLogLevelColor = (level: LogLevel) => {
    switch (level) {
        case 'ERROR': return 'text-red-400';
        case 'WARN': return 'text-yellow-400';
        case 'INFO': return 'text-cyan-400';
        case 'DEBUG': return 'text-gray-500';
        default: return 'text-gray-300';
    }
};

const MONITORS = [
  { id: 'hardware', name: 'Hardware Resources' },
  { id: 'cognition', name: 'Cognition' },
  { id: 'kpi', name: 'Performance KPIs' },
  { id: 'logs', name: 'Backend Log Stream' },
];

const SystemMonitorPanel: React.FC = () => {
    const { apiKey } = useContext(ApiKeyContext);
    const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
    const [kpis, setKpis] = useState<PerformanceKPIs | null>(null);
    const [logs, setLogs] = useState<BackendLogEntry[]>([]);
    const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
    const [logFilter, setLogFilter] = useState<LogLevel[]>(['INFO', 'WARN', 'ERROR', 'DEBUG']);
    const [isPaused, setIsPaused] = useState(false);
    const logContainerRef = React.useRef<HTMLDivElement>(null);
    const settingsRef = useRef<HTMLDivElement>(null);

    const [visibleMonitors, setVisibleMonitors] = useLocalStorage<string[]>(
        'mindshard-visible-monitors',
        MONITORS.map(m => m.id) // Default to all visible
    );
    const [settingsOpen, setSettingsOpen] = useState(false);


    useEffect(() => {
        if (!apiKey || isPaused) return;

        const intervalId = setInterval(() => {
            getSystemMetrics(apiKey).then(setMetrics);
            getPerformanceKpis(apiKey).then(setKpis);
            getBackendLogs(apiKey).then(setLogs);
            getSystemStatus(apiKey).then(setSystemStatus);
        }, 2000); // Poll every 2 seconds

        // initial fetch
        getSystemMetrics(apiKey).then(setMetrics);
        getPerformanceKpis(apiKey).then(setKpis);
        getBackendLogs(apiKey).then(setLogs);
        getSystemStatus(apiKey).then(setSystemStatus);

        return () => clearInterval(intervalId);
    }, [apiKey, isPaused]);
    
    useEffect(() => {
        // Close settings dropdown on outside click
        const handleClickOutside = (event: MouseEvent) => {
            if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
                setSettingsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    useEffect(() => {
        // Auto-scroll log view
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs]);

    const toggleLogFilter = (level: LogLevel) => {
        setLogFilter(prev =>
            prev.includes(level) ? prev.filter(l => l !== level) : [...prev, level]
        );
    };
    
    const toggleMonitor = (id: string) => {
        setVisibleMonitors(prev =>
            prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
        );
    };

    const filteredLogs = useMemo(() => {
        return logs.filter(log => logFilter.includes(log.level));
    }, [logs, logFilter]);
    
    const logLevels: LogLevel[] = ['DEBUG', 'INFO', 'WARN', 'ERROR'];

    return (
        <div className="p-4 flex flex-col h-full">
            <h2 className="text-xl font-bold text-gray-300 border-b border-gray-700 pb-2 mb-4 flex-shrink-0">System Monitor</h2>
            <div className="flex flex-col h-full space-y-4">
                <div className="flex justify-between items-center">
                    <div></div>
                     <div className="relative" ref={settingsRef}>
                        <button 
                            onClick={() => setSettingsOpen(!settingsOpen)} 
                            className="p-2 text-gray-400 hover:text-white bg-gray-700/50 hover:bg-gray-700 rounded-md transition-colors"
                            title="Configure Monitors"
                        >
                            <Cog6ToothIcon className="h-5 w-5" />
                        </button>
                        {settingsOpen && (
                            <div className="absolute top-full right-0 mt-2 w-64 bg-gray-800 border border-gray-600 rounded-lg shadow-xl z-20 p-4">
                                <h4 className="font-semibold text-gray-200 mb-3">Visible Monitors</h4>
                                <div className="space-y-2">
                                    {MONITORS.map(monitor => (
                                        <label key={monitor.id} className="flex items-center space-x-3 cursor-pointer p-1 hover:bg-gray-700/50 rounded-md">
                                            <input
                                                type="checkbox"
                                                checked={visibleMonitors.includes(monitor.id)}
                                                onChange={() => toggleMonitor(monitor.id)}
                                                className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-cyan-500 focus:ring-cyan-500"
                                            />
                                            <span className="text-sm text-gray-300">{monitor.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                    {visibleMonitors.length === 0 && (
                        <div className="text-center text-gray-500 pt-10">
                            No monitors selected. Click the gear icon to enable monitors.
                        </div>
                    )}

                    {visibleMonitors.includes('hardware') && (
                         <AccordionSection title="Hardware Resources">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                {metrics?.cpu_usage !== undefined && <ResourceGauge label="CPU Usage" value={metrics.cpu_usage} />}
                                {metrics?.memory_usage !== undefined && <ResourceGauge label="Memory (RAM)" value={metrics.memory_usage} />}
                                {metrics?.gpu_usage !== undefined && <ResourceGauge label="GPU Usage" value={metrics.gpu_usage} />}
                                {metrics?.vram_usage !== undefined && <ResourceGauge label="VRAM" value={metrics.vram_usage} />}
                            </div>
                        </AccordionSection>
                    )}

                    {visibleMonitors.includes('cognition') && (
                        <AccordionSection title="Cognition">
                            {systemStatus?.cognition ? (
                                <div className="space-y-4">
                                    <ProgressBar label="Short-Term Memory Buffer" value={systemStatus.cognition.stm_buffer_size} max={systemStatus.cognition.stm_buffer_threshold} />
                                    <div className="grid grid-cols-2 gap-4">
                                        <KpiCard label="Digestor Status" value={systemStatus.cognition.digestor_status} />
                                        <div className="bg-gray-700/50 p-4 rounded-lg">
                                            <div className="text-sm text-gray-400 mb-2">Active Knowledge Bases</div>
                                            <div className="text-sm text-cyan-300 font-semibold space-y-1">
                                                {systemStatus.cognition.loaded_knowledge_bases.length > 0 ? systemStatus.cognition.loaded_knowledge_bases.map(kb => <div key={kb}>{kb}</div>) : <div className="text-gray-500">None</div>}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-gray-500">Loading cognitive status...</p>
                            )}
                        </AccordionSection>
                    )}
                    
                    {visibleMonitors.includes('kpi') && (
                        <AccordionSection title="Performance KPIs">
                             <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {kpis ? <>
                                    <KpiCard label="Total Inferences" value={kpis.total_inferences} />
                                    <KpiCard label="Avg Latency (ms)" value={kpis.avg_latency_ms} />
                                    <KpiCard label="Digest Ops" value={kpis.digest_ops} />
                                    <KpiCard label="Undigest Ops" value={kpis.undigest_ops} />
                                </> : <p className="text-gray-500 col-span-4">Loading KPIs...</p>}
                            </div>
                        </AccordionSection>
                    )}
                    
                    {visibleMonitors.includes('logs') && (
                        <div className="flex-1 flex flex-col min-h-0">
                            <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
                                <h3 className="text-lg font-semibold">Backend Log Stream</h3>
                                <div className="flex items-center space-x-2">
                                     {logLevels.map(level => (
                                        <button key={level} onClick={() => toggleLogFilter(level)}
                                            className={`px-2 py-1 text-xs rounded ${logFilter.includes(level) ? 'bg-cyan-500 text-white' : 'bg-gray-600 text-gray-300'}`}>
                                            {level}
                                        </button>
                                    ))}
                                    <button onClick={() => setIsPaused(!isPaused)} className={`px-3 py-1 text-sm rounded ${isPaused ? 'bg-yellow-500' : 'bg-green-500'}`}>{isPaused ? 'Resume' : 'Pause'}</button>
                                    <button onClick={() => setLogs([])} className="px-3 py-1 text-sm rounded bg-red-600">Clear</button>
                                </div>
                            </div>
                            <div ref={logContainerRef} className="flex-1 bg-gray-900/80 p-3 rounded font-mono text-xs overflow-y-auto border border-gray-700 min-h-[100px]">
                                {filteredLogs.map((log, index) => (
                                    <div key={index} className="whitespace-pre-wrap leading-relaxed">
                                        <span className="text-gray-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                        <span className={`font-bold mx-2 ${getLogLevelColor(log.level)}`}>[{log.level}]</span>
                                        <span className="text-gray-300">{log.message}</span>
                                    </div>
                                ))}
                                 {logs.length === 0 && <p className="text-gray-500">Waiting for logs...</p>}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const AccordionSection: React.FC<{ title: string; children: React.ReactNode, defaultOpen?: boolean }> = ({ title, children, defaultOpen = true }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="bg-gray-800/80 rounded-lg border border-gray-700">
      <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center p-3 text-left font-semibold text-cyan-300 hover:bg-gray-800/20 rounded-t-lg text-md">
        <span>{title}</span>
        <ChevronDownIcon className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && <div className="p-3 border-t border-gray-700">{children}</div>}
    </div>
  );
};

interface IconProps {
  className?: string;
}

export default SystemMonitorPanel;