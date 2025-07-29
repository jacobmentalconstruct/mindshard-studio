import React, { useState, useContext, useMemo, useEffect } from 'react';
import FrameBox from '../FrameBox';
import { ApiKeyContext, KnowledgeContext } from '../../App';
import { ingestUrl, crawlAndDigestSite } from '../../services/mindshardService';
import useLocalStorage from '../../hooks/useLocalStorage';
import { PlusIcon } from '../Icons';

const CloseIcon: React.FC<{className?: string; onClick?: (e: React.MouseEvent) => void}> = ({className, onClick}) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className={className} onClick={onClick}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
);

interface BrowserTab {
  id: string;
  url: string;
}

const BrowserPanel: React.FC = () => {
  const { apiKey } = useContext(ApiKeyContext);
  const { targetKbId } = useContext(KnowledgeContext);

  const [tabs, setTabs] = useState<BrowserTab[]>([
    { id: `br-${Date.now()}`, url: 'https://en.wikipedia.org/wiki/React_(JavaScript_library)' }
  ]);
  const [activeTabId, setActiveTabId] = useState<string | null>(tabs.length > 0 ? tabs[0].id : null);
  const [inputValue, setInputValue] = useState<string>(tabs.length > 0 ? tabs[0].url : '');
  const [message, setMessage] = useState('');

  const activeTab = useMemo(() => tabs.find(t => t.id === activeTabId), [tabs, activeTabId]);

  useEffect(() => {
    setInputValue(activeTab?.url || '');
  }, [activeTab]);

  const handleTabClick = (tabId: string) => {
    setActiveTabId(tabId);
  };

  const handleNewTab = () => {
    const newTab: BrowserTab = { id: `br-${Date.now()}`, url: 'about:blank' };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  const handleCloseTab = (tabIdToClose: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const indexToClose = tabs.findIndex(t => t.id === tabIdToClose);
    const newTabs = tabs.filter(t => t.id !== tabIdToClose);
    setTabs(newTabs);

    if (activeTabId === tabIdToClose) {
      if (newTabs.length > 0) {
        const newActiveIndex = Math.max(0, indexToClose - 1);
        setActiveTabId(newTabs[newActiveIndex].id);
      } else {
        setActiveTabId(null);
      }
    }
  };

  const handleNavigate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTab || !inputValue) return;
    setTabs(tabs.map(t => (t.id === activeTabId ? { ...t, url: inputValue } : t)));
  };

  const handleDigestPage = async () => {
    if (!activeTab) return;
    setMessage(`Ingesting ${activeTab.url}...`);
    try {
      await ingestUrl(apiKey, activeTab.url, targetKbId);
      setMessage(`Successfully ingested ${activeTab.url}`);
    } catch {
      setMessage(`Failed to ingest ${activeTab.url}`);
    }
    setTimeout(() => setMessage(''), 3000);
  };

  const handleCrawlSite = async () => {
    if (!activeTab) return;
    setMessage(`Crawling site from ${activeTab.url}...`);
    try {
      const result = await crawlAndDigestSite(apiKey, activeTab.url, targetKbId!);
      setMessage(`Successfully crawled and ingested ${result.pages_crawled} pages.`);
    } catch {
      setMessage(`Failed to crawl site ${activeTab.url}`);
    }
    setTimeout(() => setMessage(''), 4000);
  };

  const canIngest = apiKey && targetKbId;

  return (
    <FrameBox 
      title="Browser"
    >
      <div className="flex flex-col h-full">
        <div className="flex-shrink-0 flex items-center border-b border-gray-700 bg-gray-900/50">
            {tabs.map(tab => (
                <button 
                    key={tab.id} 
                    onClick={() => handleTabClick(tab.id)}
                    className={`flex items-center space-x-2 py-2 px-4 border-r border-gray-700 text-sm transition-colors max-w-[200px] ${activeTabId === tab.id ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700/50'}`}
                >
                    <span className="truncate">{tab.url === 'about:blank' ? 'New Tab' : tab.url.replace(/^https?:\/\//, '')}</span>
                    <CloseIcon className="h-4 w-4 text-gray-500 hover:text-white flex-shrink-0" onClick={(e) => handleCloseTab(tab.id, e)} />
                </button>
            ))}
            <button onClick={handleNewTab} className="p-2 text-gray-400 hover:text-white hover:bg-gray-700/50">
                <PlusIcon className="h-5 w-5" />
            </button>
        </div>

        <div className="p-2 border-b border-gray-700 space-y-2">
          <form onSubmit={handleNavigate} className="flex-grow flex space-x-2">
            <input
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              className="flex-grow bg-gray-900 p-2 rounded border border-gray-600"
              disabled={!activeTab}
            />
            <button type="submit" className="bg-cyan-500 px-4 py-2 rounded" disabled={!activeTab}>Go</button>
          </form>
          <div className="flex space-x-2">
            <button onClick={handleDigestPage} disabled={!canIngest || !activeTab} className="w-1/2 bg-green-600 hover:bg-green-700 px-4 py-2 rounded whitespace-nowrap disabled:bg-gray-500 disabled:cursor-not-allowed">Digest Page</button>
            <button onClick={handleCrawlSite} disabled={!canIngest || !activeTab} className="w-1/2 bg-green-600 hover:bg-green-700 px-4 py-2 rounded whitespace-nowrap disabled:bg-gray-500 disabled:cursor-not-allowed">Crawl & Digest</button>
          </div>
          {!canIngest && <p className="text-xs text-yellow-400 text-center">Select a Knowledge Base in the 'Ingestion' tab to enable digesting.</p>}
        </div>
        {message && <div className="p-2 text-center text-sm text-cyan-300">{message}</div>}
        <div className="flex-1 mt-2 bg-gray-900 rounded">
          {activeTab ? (
            <iframe
              src={activeTab.url}
              className="w-full h-full border-0 rounded"
              title="Browser"
              sandbox="allow-scripts allow-same-origin"
              onError={() => setMessage(`Could not load or embed ${activeTab.url}. Some sites may block embedding.`)}
            ></iframe>
          ) : (
             <div className="flex items-center justify-center h-full text-gray-500">
                Create a new tab to start browsing.
            </div>
          )}
        </div>
      </div>
    </FrameBox>
  );
};

export default BrowserPanel;
