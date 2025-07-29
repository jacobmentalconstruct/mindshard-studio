
import React from 'react';
import { LoadingStatus } from '../types';
import { CheckIcon } from './icons/CheckIcon';
import { SpinnerIcon } from './icons/SpinnerIcon';
import { CircleIcon } from './icons/CircleIcon';

interface LoadingItemProps {
  label: string;
  status: LoadingStatus;
  level: number;
}

const LoadingItemComponent: React.FC<LoadingItemProps> = ({ label, status, level }) => {
  const getStatusContent = () => {
    switch (status) {
      case LoadingStatus.COMPLETED:
        return {
          icon: <CheckIcon />,
          textClass: 'text-green-300',
          bgClass: 'bg-green-500/10'
        };
      case LoadingStatus.LOADING:
        return {
          icon: <SpinnerIcon />,
          textClass: 'text-blue-300',
          bgClass: 'bg-blue-500/10'
        };
      case LoadingStatus.PENDING:
      default:
        return {
          icon: <CircleIcon />,
          textClass: 'text-slate-400',
          bgClass: 'bg-slate-800/60'
        };
    }
  };

  const { icon, textClass, bgClass } = getStatusContent();
  const indentClass = `pl-${level * 3 + 2}`;

  return (
    <div
      className={`flex items-center gap-3 p-2 ${indentClass} rounded-md transition-all duration-300 ${bgClass}`}
    >
      <div className={`flex-shrink-0 w-5 h-5 flex items-center justify-center ${textClass}`}>
        {icon}
      </div>
      <span className={`text-sm font-medium transition-colors duration-300 ${textClass}`}>
        {label}
      </span>
    </div>
  );
};

export default LoadingItemComponent;
