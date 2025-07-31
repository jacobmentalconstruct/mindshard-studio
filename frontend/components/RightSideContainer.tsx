

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { PanelType } from '../types';

import BrowserPanel from './panels/BrowserPanel';
import TextEditorPanel from './panels/TextEditorPanel';
import { IngestionPanel } from './panels/IngestionPanel';
import VersioningPanel from './panels/VersioningPanel';
import ProjectToolsPanel from './panels/ProjectToolsPanel';


import { DocumentTextIcon, GlobeAltIcon, DocumentPlusIcon, RectangleStackIcon, WrenchScrewdriverIcon } from './Icons';


interface PanelTab {
    type: PanelType | string;
    icon: React.ReactNode;
    name: string;
    disabled?: boolean;
}

const RightSideContainer: React.FC = () => {
    const navRef = useRef<HTMLDivElement>(null);
    const [showLeftShadow, setShowLeftShadow] = useState(false);
    const [showRightShadow, setShowRightShadow] = useState(false);
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    const handleScroll = useCallback(() => {
        const nav = navRef.current;
        if (nav) {
            const { scrollLeft, scrollWidth, clientWidth } = nav;
            const PADDING = 1; // Add padding to avoid premature shadow removal
            setShowLeftShadow(scrollLeft > PADDING);
            setShowRightShadow(scrollLeft < scrollWidth - clientWidth - PADDING);
        }
    }, []);

    useEffect(() => {
        const nav = navRef.current;
        if (nav) {
            handleScroll();
            nav.addEventListener('scroll', handleScroll, { passive: true });
            
            const resizeObserver = new ResizeObserver(handleScroll);
            resizeObserver.observe(nav);

            return () => {
                nav.removeEventListener('scroll', handleScroll);
                resizeObserver.unobserve(nav);
            };
        }
    }, [handleScroll]);

     const initialTabs: PanelTab[] = [
        { type: PanelType.Editor, icon: <DocumentTextIcon className="h-5 w-5" />, name: 'Editor' },
        { type: PanelType.Ingestion, icon: <DocumentPlusIcon className="h-5 w-5" />, name: 'Ingestion' },
        { type: PanelType.Browser, icon: <GlobeAltIcon className="h-5 w-5" />, name: 'Browser' },
        { type: PanelType.Versioning, icon: <RectangleStackIcon className="h-5 w-5" />, name: 'Versioning' },
        { type: PanelType.ProjectTools, icon: <WrenchScrewdriverIcon className="h-5 w-5" />, name: 'Tools' },
    ];

    const [panelTabs, setPanelTabs] = useState<PanelTab[]>(initialTabs);
    const [activePanel, setActivePanel] = useState<PanelType | string>(PanelType.Editor);

    const handleDrop = () => {
        const newTabs = [...panelTabs];
        if (dragItem.current !== null && dragOverItem.current !== null) {
            const draggedItemContent = newTabs.splice(dragItem.current, 1)[0];
            newTabs.splice(dragOverItem.current, 0, draggedItemContent);
        }
        dragItem.current = null;
        dragOverItem.current = null;
        setPanelTabs(newTabs);
    };

    const renderActivePanel = useCallback(() => {
        switch (activePanel) {
          case PanelType.Editor:
            return <TextEditorPanel />;
          case PanelType.Ingestion:
            return <IngestionPanel />;
          case PanelType.Browser:
            return <BrowserPanel />;
          case PanelType.Versioning:
            return <VersioningPanel />;
           case PanelType.ProjectTools:
            return <ProjectToolsPanel />;
          default:
            return <TextEditorPanel />;
        }
    }, [activePanel]);
    
    return (
        <div className="flex flex-col h-full bg-gray-800 text-gray-200 font-sans">
            <div className="border-b border-gray-700 relative">
              <div ref={navRef} className="overflow-x-auto">
                <nav className="flex space-x-1" aria-label="Tabs" onDragOver={(e) => e.preventDefault()}>
                  {panelTabs.map((tab, index) => (
                    <button
                      key={tab.type}
                      onClick={() => !tab.disabled && setActivePanel(tab.type)}
                      title={tab.name}
                      draggable
                      onDragStart={() => dragItem.current = index}
                      onDragEnter={() => dragOverItem.current = index}
                      onDragEnd={handleDrop}
                      onDragOver={(e) => e.preventDefault()}
                      className={`
                        ${activePanel === tab.type ? 'border-cyan-400 text-cyan-400 bg-gray-900/50' : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'}
                        flex-shrink-0 flex items-center justify-center whitespace-nowrap py-3 px-4 border-b-2 font-medium text-sm transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed
                      `}
                      disabled={tab.disabled}
                    >
                      {tab.icon}
                      <span className="ml-2">{tab.name}</span>
                    </button>
                  ))}
                </nav>
              </div>
               {/* Shadows for scroll indication */}
              <div className={`absolute top-0 bottom-0 left-0 w-8 bg-gradient-to-r from-gray-800 to-transparent pointer-events-none transition-opacity duration-300 ${showLeftShadow ? 'opacity-100' : 'opacity-0'}`} />
              <div className={`absolute top-0 bottom-0 right-0 w-8 bg-gradient-to-l from-gray-800 to-transparent pointer-events-none transition-opacity duration-300 ${showRightShadow ? 'opacity-100' : 'opacity-0'}`} />
            </div>
            <div className="flex-1 overflow-hidden">
              {renderActivePanel()}
            </div>
        </div>
    );
};

export default RightSideContainer;