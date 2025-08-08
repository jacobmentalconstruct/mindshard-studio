import React, { useState, useEffect, useRef } from 'react';

const MenuItem: React.FC<{
  label: string;
  onClick: () => void;
  shortcut?: string;
  disabled?: boolean;
}> = ({ label, onClick, shortcut, disabled = false }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="w-full text-left flex justify-between items-center px-3 py-1.5 text-sm text-gray-200 hover:bg-cyan-500 hover:text-white disabled:text-gray-500 disabled:bg-transparent"
  >
    <span>{label}</span>
    {shortcut && <span className="text-gray-400">{shortcut}</span>}
  </button>
);

const Menu: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => {
            // This logic allows switching menus by hovering if one is already open
            const anyMenuOpen = document.querySelector('[data-menu-open="true"]');
            if (anyMenuOpen && !isOpen) {
                anyMenuOpen?.dispatchEvent(new MouseEvent('click', {bubbles: true}));
                setIsOpen(true);
            }
        }}
        data-menu-open={isOpen}
        className={`px-3 py-1 text-sm rounded ${isOpen ? 'bg-gray-700' : 'hover:bg-gray-700'}`}
      >
        {label}
      </button>
      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-56 bg-gray-800 border border-gray-600 rounded-md shadow-lg z-50 py-1">
          {children}
        </div>
      )}
    </div>
  );
};

const NativeMenuBar: React.FC = () => {
  const handleReload = () => window.location.reload();
  const handleQuit = () => {
    // This doesn't work in a browser, but it's the intent for Tauri
    console.log("Attempting to close the application...");
    // In Tauri, you would use: import { appWindow } from '@tauri-apps/api/window'; appWindow.close();
    alert("In a real desktop app, this would quit.");
  };
  const handleAbout = () => {
    alert("Mindshard Studio v2.0\n\nAI-powered development environment.");
  };
  
  const handleEdit = (action: string) => {
     document.execCommand(action);
  }

  return (
    <div className="w-full bg-gray-800/90 border-b border-gray-700 px-2 py-1 flex items-center space-x-1 text-gray-200 text-sm flex-shrink-0">
      <Menu label="File">
        <MenuItem label="Reload UI" onClick={handleReload} shortcut="Ctrl+R" />
        <div className="h-px bg-gray-600 my-1" />
        <MenuItem label="Quit" onClick={handleQuit} shortcut="Ctrl+Q" />
      </Menu>
      <Menu label="Edit">
        <MenuItem label="Undo" onClick={() => handleEdit('undo')} shortcut="Ctrl+Z" />
        <MenuItem label="Redo" onClick={() => handleEdit('redo')} shortcut="Ctrl+Y" />
        <div className="h-px bg-gray-600 my-1" />
        <MenuItem label="Cut" onClick={() => handleEdit('cut')} shortcut="Ctrl+X" />
        <MenuItem label="Copy" onClick={() => handleEdit('copy')} shortcut="Ctrl+C" />
        <MenuItem label="Paste" onClick={() => handleEdit('paste')} shortcut="Ctrl+V" />
      </Menu>
      <Menu label="Help">
        <MenuItem label="About" onClick={handleAbout} />
      </Menu>
    </div>
  );
};

export default NativeMenuBar;
