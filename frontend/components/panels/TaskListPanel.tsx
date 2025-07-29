import React, { useState, useEffect, useContext, useCallback, useRef } from 'react';
import { TaskList, Task } from '../../types';
import { getAllTaskLists, addTask, updateTask, createTaskList, renameTaskList, deleteTaskList, approveTask, rejectTask, cancelTask } from '../../services/mindshardService';
import { ApiKeyContext, TaskContext } from '../../App';
import FrameBox from '../FrameBox';
import { PlusIcon, EllipsisVerticalIcon, ChevronRightIcon, CheckCircleIcon, XCircleIcon, ClockIcon } from '../Icons';
import useLocalStorage from '../../hooks/useLocalStorage';

const getStatusIcon = (status: Task['status']) => {
    switch (status) {
        case 'Complete': return <CheckCircleIcon className="h-5 w-5 text-green-400" />;
        case 'Running': return <div className="h-4 w-4 rounded-full bg-blue-500 animate-pulse border-2 border-blue-300" />;
        case 'Pending': return <ClockIcon className="h-5 w-5 text-gray-500" />;
        case 'Error': return <XCircleIcon className="h-5 w-5 text-red-400" />;
        case 'Awaiting-Approval': return <QuestionMarkCircleIcon className="h-5 w-5 text-yellow-400" />;
        default: return null;
    }
};

const QuestionMarkCircleIcon: React.FC<{className?: string}> = (props) => (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
    </svg>
);


interface TaskNodeProps {
    task: Task;
    onUpdate: () => void;
    level: number;
}

const TaskNode: React.FC<TaskNodeProps> = ({ task, onUpdate, level }) => {
    const [isOpen, setIsOpen] = useState(true);
    const { apiKey } = useContext(ApiKeyContext);
    const { selectedTaskId, setSelectedTaskId } = useContext(TaskContext);
    const isSelected = selectedTaskId === task.id;

    const handleAction = async (action: 'approve' | 'reject' | 'cancel', taskId: string) => {
        if (!apiKey) return;
        switch (action) {
            case 'approve': await approveTask(apiKey, taskId); break;
            case 'reject': await rejectTask(apiKey, taskId); break;
            case 'cancel': await cancelTask(apiKey, taskId); break;
        }
        onUpdate();
    };

    return (
        <div style={{ marginLeft: `${level * 1.25}rem`}}>
            <div 
              className={`flex items-center group py-1.5 px-2 rounded-md transition-colors ${isSelected ? 'bg-cyan-500/20' : 'hover:bg-gray-700/50'}`}
              onClick={() => setSelectedTaskId(task.id)}
            >
                {task.sub_tasks && task.sub_tasks.length > 0 && (
                     <ChevronRightIcon 
                        className={`h-4 w-4 mr-1 cursor-pointer transition-transform flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`}
                        onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }} 
                    />
                )}
                <div className={`flex-shrink-0 mr-2 ${!task.sub_tasks || task.sub_tasks.length === 0 ? 'ml-5' : ''}`}>{getStatusIcon(task.status)}</div>
                <span className={`flex-grow text-sm ${task.status === 'Complete' ? 'line-through text-gray-500' : ''}`}>{task.text}</span>
                
                <div className="flex-shrink-0 flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {task.status === 'Awaiting-Approval' && (
                        <>
                            <button onClick={(e) => {e.stopPropagation(); handleAction('approve', task.id)}} className="text-xs bg-green-500 hover:bg-green-600 text-white px-2 py-0.5 rounded">Approve</button>
                            <button onClick={(e) => {e.stopPropagation(); handleAction('reject', task.id)}} className="text-xs bg-red-500 hover:bg-red-600 text-white px-2 py-0.5 rounded">Reject</button>
                        </>
                    )}
                    {task.status === 'Running' && (
                        <button onClick={(e) => {e.stopPropagation(); handleAction('cancel', task.id)}} className="text-xs bg-gray-500 hover:bg-gray-600 text-white px-2 py-0.5 rounded">Cancel</button>
                    )}
                </div>
            </div>
            {isOpen && task.sub_tasks && (
                <div className="mt-1">
                    {task.sub_tasks.map(sub => <TaskNode key={sub.id} task={sub} onUpdate={onUpdate} level={level + 1} />)}
                </div>
            )}
        </div>
    )
}

const TaskListPanel: React.FC = () => {
  const [taskLists, setTaskLists] = useState<TaskList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [newTaskText, setNewTaskText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const { apiKey } = useContext(ApiKeyContext);
  const menuRef = useRef<HTMLDivElement>(null);


  const fetchTaskLists = useCallback(() => {
    if (!apiKey) return;
    setIsLoading(true);
    getAllTaskLists(apiKey).then(lists => {
      setTaskLists(lists);
      const currentListExists = lists.some(l => l.id === selectedListId);
      if (lists.length > 0 && !currentListExists) {
        setSelectedListId(lists[0].id);
      } else if (lists.length === 0) {
        setSelectedListId(null);
      }
    }).finally(() => setIsLoading(false));
  }, [apiKey, selectedListId]);

  useEffect(() => {
    fetchTaskLists();
    const interval = setInterval(fetchTaskLists, 5000); // Poll for updates
    return () => clearInterval(interval);
  }, [apiKey]); // Only depends on apiKey to setup/teardown
  
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
            setOpenMenuId(null);
        }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
        document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuRef]);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey || !selectedListId || !newTaskText.trim()) return;
    await addTask(apiKey, selectedListId, newTaskText);
    setNewTaskText('');
    fetchTaskLists(); // Re-fetch to update the list
  };
  
  const handleNewList = async () => {
    if (!apiKey) return;
    const name = prompt("Enter new list name:");
    if (name && name.trim()) {
        const newList = await createTaskList(apiKey, name.trim());
        fetchTaskLists();
        setSelectedListId(newList.id);
    }
  };

  const handleRenameList = async (listId: string, currentName: string) => {
    setOpenMenuId(null);
    if (!apiKey) return;
    const newName = prompt("Enter new list name:", currentName);
    if (newName && newName.trim() && newName.trim() !== currentName) {
        await renameTaskList(apiKey, listId, newName.trim());
        fetchTaskLists();
    }
  };

  const handleDeleteList = async (listId: string) => {
    setOpenMenuId(null);
    if (!apiKey) return;
    if (window.confirm("Are you sure you want to delete this list and all its tasks? This cannot be undone.")) {
        await deleteTaskList(apiKey, listId);
        fetchTaskLists();
    }
  };

  const selectedList = taskLists.find(list => list.id === selectedListId);

  return (
    <FrameBox 
      title="Thought Tree"
    >
      <div className="flex h-full space-x-4">
        {/* Task Lists Column */}
        <div className="w-1/3 border-r border-gray-700 pr-4 flex flex-col">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold">Plans</h3>
            <button onClick={handleNewList} title="New Plan" className="p-1 text-gray-400 hover:text-white hover:bg-gray-600 rounded-full transition">
              <PlusIcon className="h-5 w-5" />
            </button>
          </div>
          {isLoading && <p>Loading plans...</p>}
          <ul className="space-y-2 overflow-y-auto">
            {taskLists.map(list => (
              <li key={list.id} className="relative">
                <div className="flex items-center group">
                  <button
                    onClick={() => setSelectedListId(list.id)}
                    className={`flex-grow text-left p-2 rounded-l-md transition-colors ${selectedListId === list.id ? 'bg-cyan-500 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
                  >
                    {list.name}
                  </button>
                  <button
                    onClick={() => setOpenMenuId(openMenuId === list.id ? null : list.id)}
                    className={`p-2 rounded-r-md transition-colors ${selectedListId === list.id ? 'bg-cyan-500 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}
                  >
                    <EllipsisVerticalIcon className="h-5 w-5" />
                  </button>
                </div>
                {openMenuId === list.id && (
                  <div ref={menuRef} className="absolute right-0 top-full mt-1 w-36 bg-gray-900 border border-gray-600 rounded-md shadow-lg z-10 py-1">
                      <button onClick={() => handleRenameList(list.id, list.name)} className="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors">Rename</button>
                      <button onClick={() => handleDeleteList(list.id)} className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700 transition-colors">Delete</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Tasks Column */}
        <div className="w-2/3 flex flex-col">
          {selectedList ? (
            <>
              <h3 className="text-lg font-semibold mb-3">{selectedList.name}</h3>
              <div className="flex-1 overflow-y-auto space-y-1 pr-2">
                {selectedList.tasks.map(task => (
                    <TaskNode key={task.id} task={task} onUpdate={fetchTaskLists} level={0} />
                ))}
                {selectedList.tasks.length === 0 && <p className="text-gray-500">No tasks in this list.</p>}
              </div>
              <form onSubmit={handleAddTask} className="mt-4 flex space-x-2">
                <input
                  type="text"
                  value={newTaskText}
                  onChange={e => setNewTaskText(e.target.value)}
                  placeholder="Add a new root task"
                  className="flex-grow bg-gray-700 p-2 rounded"
                />
                <button type="submit" className="bg-cyan-500 px-4 py-2 rounded">Add</button>
              </form>
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-500">{isLoading ? 'Loading...' : 'Create or select a plan.'}</p>
            </div>
          )}
        </div>
      </div>
    </FrameBox>
  );
};

export default TaskListPanel;
