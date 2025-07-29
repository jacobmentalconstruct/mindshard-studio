
import React from 'react';
import { Status } from '../types';
import { SpinnerIcon, CheckCircleIcon, XCircleIcon, IdleIcon } from './Icons';

interface LoaderItemProps {
  label: string;
  status: Status;
  details?: string | null;
}

const statusConfig = {
  [Status.IDLE]: {
    Icon: IdleIcon,
    color: 'text-slate-500',
    text: 'Waiting...',
  },
  [Status.LOADING]: {
    Icon: SpinnerIcon,
    color: 'text-blue-400',
    text: 'Loading...',
  },
  [Status.SUCCESS]: {
    Icon: CheckCircleIcon,
    color: 'text-green-400',
    text: 'Ready',
  },
  [Status.ERROR]: {
    Icon: XCircleIcon,
    color: 'text-red-400',
    text: 'Failed',
  },
};

const LoaderItem: React.FC<LoaderItemProps> = ({ label, status, details }) => {
  const { Icon, color, text } = statusConfig[status];

  return (
    <div className={`flex items-center justify-between p-3 bg-slate-800/50 rounded-lg transition-all duration-300`}>
      <div className="flex items-center gap-3">
        <Icon className={`w-5 h-5 ${color} transition-colors duration-300`} />
        <div>
            <p className="font-medium text-slate-200">{label}</p>
            {details && <p className="text-xs text-slate-400">{details}</p>}
        </div>
      </div>
      <p className={`text-sm font-semibold ${color} transition-colors duration-300`}>{text}</p>
    </div>
  );
};

export default LoaderItem;
