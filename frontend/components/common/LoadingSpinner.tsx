import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  text?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 'md', className = '', text }) => {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-10 h-10 border-4',
  };

  return (
    <div className={`flex items-center justify-center space-x-2 ${className}`}>
        <div
            className={`animate-spin rounded-full border-solid border-cyan-400 border-t-transparent ${sizeClasses[size]}`}
            role="status"
            aria-label="loading"
        ></div>
        {text && <span className="text-gray-300">{text}</span>}
    </div>
  );
};

export default LoadingSpinner;
