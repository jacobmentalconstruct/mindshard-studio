
import React, { useState, useContext, useEffect, useRef } from 'react';
import FrameBox from '../FrameBox';
import { ProjectFilesContext } from '../../App';
import { useAppStore } from '../../stores/appStore';
import * as mindshardService from '../../services/mindshardService';
import { CondaEnv, ServerStatusResponse, ServerLogEntry } from '../../types';
import { ChevronDownIcon, ClipboardDocumentCheckIcon, BrainCircuitIcon } from '../Icons';
import useTauriStore from '../../hooks/useTauriStore';


const AccordionSection: React.FC<{ title: string; children: React.ReactNode, defaultOpen?: boolean }> = ({ title, children, defaultOpen = true }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="bg-gray-900/50 rounded-lg border border-gray-700">
      <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center p-3 text-left font-semibold text-cyan-400 hover:bg-gray-800/20 rounded-t-lg">
        <span>{title}</span>
        <ChevronDownIcon className={`w-5 h-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && <div className="p-3 border-t border-gray-700 space-y-3">{children}</div>}
    </div>
  );
};

const ProjectToolsPanel: React.FC = () => {
    const apiKey = useAppStore(state => state.apiKey);
    const { selectedPaths, exclusions } = useContext(ProjectFilesContext);
    const [result, setResult] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isAgentAware, setIsAgentAware] = useTauriStore('mindshard-aware-project-tools', true);

    
    // Audit state
    const [condaEnvs, setCondaEnvs] = useState<CondaEnv[]>([]);
    const [selectedCondaEnv, setSelectedCondaEnv] = useState<string>('');
    
    // Server state
    const [serverStatus, setServerStatus] = useState<ServerStatusResponse>({ isRunning: false, port: null });
    const [serverPort, setServerPort] = useState<number>(8000);
    const [autoOpen, setAutoOpen] = useState<boolean>(true);
    const [removeIndex, setRemoveIndex] = useState<boolean>(true);
    const [serverLogs, setServerLogs] = useState<ServerLogEntry[]>([]);
    const serverLogInterval = useRef<number | null>(null);

    const handleApiCall = async (apiFunc: () => Promise<{ message?: string; report?: string; backup_path?: string; }>) => {
        if (!apiKey) {
            setResult("API Key is not set.");
            return;
        }
        setIsLoading(true);
        try {
            const response = await apiFunc();
            setResult(response.message || response.report || response.backup_path || "Success!");
        } catch (error: any) {
            setResult(`Error: ${error.message}`);
        }
        setIsLoading(false);
    };
    
    useEffect(() => {
        if (apiKey) {
            mindshardService.listCondaEnvs(apiKey).then(envs => {
                setCondaEnvs(envs);
                const active = envs.find(e => e.isActive);
                if (active) setSelectedCondaEnv(active.name);
            });
            mindshardService.getServerStatus(apiKey).then(setServerStatus);
        }
    }, [apiKey]);
    
    // Server handling
    const startServerLogStream = () => {
        if (serverLogInterval.current) clearInterval(serverLogInterval.current);
        serverLogInterval.current = window.setInterval(() => {
            const messages = ["GET /index.html 200 OK", "GET /style.css 200 OK", "GET /script.js 200 OK", "404 Not Found: /favicon.ico"];
            setServerLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message: messages[Math.floor(Math.random() * messages.length)] }]);
        }, 2500);
    };
    
    const stopServerLogStream = () => {
        if (serverLogInterval.current) {
            clearInterval(serverLogInterval.current);
            serverLogInterval.current = null;
        }
    };
    
    const handleStartServer = async () => {
        if (!apiKey) return;
        const status = await mindshardService.startServer(apiKey, serverPort, !removeIndex);
        setServerStatus(status);
        if (status.isRunning) {
            startServerLogStream();
        }
    };

    const handleStopServer = async () => {
        if (!apiKey) return;
        const status = await mindshardService.stopServer(apiKey);
        setServerStatus(status);
        stopServerLogStream();
        setServerLogs(prev => [...prev, {timestamp: new Date().toLocaleTimeString(), message: "Server stopped."}]);
    };
    
    // Log export
    const handleCopyLogs = async () => {
        if (!apiKey) return;
        const { logs } = await mindshardService.getLogsAsText(apiKey);
        navigator.clipboard.writeText(logs);
        setResult("All logs copied to clipboard.");
    };

    const handleDownloadLogs = async () => {
        if (!apiKey) return;
        const { url } = await mindshardService.downloadLogsArchive(apiKey);
        setResult(`Archive created. Starting download from ${url}...`);
        // In a real app, you'd trigger a download. Here we just log.
        console.log("Download URL:", url);
    };

    return (
        <div className="p-4 flex flex-col h-full">
            <header className="flex-shrink-0 flex items-center justify-between border-b border-gray-700 pb-2 mb-4">
                <h2 className="text-xl font-bold text-gray-200">Project Tools</h2>
                <button
                    onClick={() => setIsAgentAware(p => !p)}
                    title={isAgentAware ? "The AI agent is aware of this panel's context." : "The AI agent is NOT aware of this panel's context."}
                    className={`p-1 rounded-full transition-colors ${isAgentAware ? 'text-cyan-400 bg-cyan-900/50 hover:bg-cyan-800/50' : 'text-gray-500 hover:text-gray-300 hover:bg-gray-700'}`}
                 >
                    <BrainCircuitIcon className="h-4 w-4" />
                 </button>
            </header>
            <div className="flex flex-col h-full space-y-4 overflow-y-auto pr-2">
                {result && <div className="p-2 bg-cyan-900/50 border border-cyan-700 rounded-md text-cyan-300 text-sm mb-4">{isLoading ? "Loading..." : result}</div>}

                <AccordionSection title="Project Analysis">
                    <button onClick={() => handleApiCall(() => mindshardService.buildTreeMap(apiKey))} className="w-full text-left p-2 bg-gray-700 hover:bg-gray-600 rounded">Build Tree Map</button>
                    <button onClick={() => handleApiCall(() => mindshardService.dumpSourceFiles(apiKey))} className="w-full text-left p-2 bg-gray-700 hover:bg-gray-600 rounded">Dump Source Files</button>
                </AccordionSection>

                <AccordionSection title="Audits">
                    <div className="flex items-center space-x-2">
                        <span className="text-sm">Conda Env:</span>
                        <select value={selectedCondaEnv} onChange={e => setSelectedCondaEnv(e.target.value)} className="flex-grow bg-gray-800 p-1 rounded border border-gray-600">
                           {condaEnvs.map(env => <option key={env.name} value={env.name}>{env.name}{env.isActive ? ' (active)' : ''}</option>)}
                        </select>
                        <button onClick={() => handleApiCall(() => mindshardService.auditCondaEnv(apiKey, selectedCondaEnv))} className="p-2 bg-gray-700 hover:bg-gray-600 rounded">Audit Conda ▶︎</button>
                    </div>
                    <button onClick={() => handleApiCall(() => mindshardService.auditSystemInfo(apiKey))} className="w-full text-left p-2 bg-gray-700 hover:bg-gray-600 rounded">Audit System Info ▶︎</button>
                </AccordionSection>

                <AccordionSection title="Backup">
                     <button 
                        onClick={() => handleApiCall(() => mindshardService.backupProject(apiKey, Array.from(selectedPaths), exclusions))} 
                        disabled={selectedPaths.size === 0}
                        className="w-full text-left p-2 bg-gray-700 hover:bg-gray-600 rounded disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed"
                    >
                        Backup Project ({selectedPaths.size} items selected) ▶︎
                    </button>
                </AccordionSection>

                <AccordionSection title="Server">
                    <div className="grid grid-cols-2 gap-4 items-center">
                         <div className="flex items-center space-x-2">
                            <label htmlFor="port" className="text-sm">Port:</label>
                            <input type="number" id="port" value={serverPort} onChange={e => setServerPort(Number(e.target.value))} className="w-24 bg-gray-800 p-1 rounded border border-gray-600" />
                        </div>
                        <div className="space-y-1">
                            <label className="flex items-center space-x-2 text-sm"><input type="checkbox" checked={autoOpen} onChange={e => setAutoOpen(e.target.checked)} className="rounded bg-gray-700 border-gray-600 text-cyan-500 focus:ring-cyan-500"/><span>Auto-open browser</span></label>
                            <label className="flex items-center space-x-2 text-sm"><input type="checkbox" checked={removeIndex} onChange={e => setRemoveIndex(e.target.checked)} className="rounded bg-gray-700 border-gray-600 text-cyan-500 focus:ring-cyan-500"/><span>Remove index.html on stop</span></label>
                        </div>
                    </div>
                     <div className="flex space-x-2 mt-3">
                        <button onClick={handleStartServer} disabled={serverStatus.isRunning} className="w-full p-2 bg-green-600 hover:bg-green-700 rounded disabled:bg-gray-800">Start Server ▶︎</button>
                        <button onClick={handleStopServer} disabled={!serverStatus.isRunning} className="w-full p-2 bg-red-600 hover:bg-red-700 rounded disabled:bg-gray-800">Stop Server ▶︎</button>
                    </div>
                     <div className="mt-2 h-32 bg-gray-800 p-2 rounded-md font-mono text-xs overflow-y-auto border border-gray-600">
                        {serverLogs.map((log, i) => <div key={i}><span className="text-gray-500">{log.timestamp}</span> <span className="ml-2 text-gray-300">{log.message}</span></div>)}
                         {!serverStatus.isRunning && serverLogs.length === 0 && <span className="text-gray-500">Server is stopped.</span>}
                    </div>
                </AccordionSection>
                
                <AccordionSection title="Logs Export">
                    <button onClick={() => handleApiCall(async () => {
                        const res = await mindshardService.saveSessionLog(apiKey);
                        return { message: `Session log saved to ${res.path}` };
                    })} className="w-full text-left p-2 bg-gray-700 hover:bg-gray-600 rounded">Save App Session Log ▶︎</button>
                    <button onClick={handleDownloadLogs} className="w-full text-left p-2 bg-gray-700 hover:bg-gray-600 rounded">Download Entire Logs ZIP ▶︎</button>
                    <button onClick={handleCopyLogs} className="flex items-center justify-between w-full text-left p-2 bg-gray-700 hover:bg-gray-600 rounded">
                        <span>Copy Logs to Clipboard ▶︎</span>
                        <ClipboardDocumentCheckIcon className="h-5 w-5 text-gray-400" />
                    </button>
                </AccordionSection>
            </div>
        </div>
    );
};

export default ProjectToolsPanel;