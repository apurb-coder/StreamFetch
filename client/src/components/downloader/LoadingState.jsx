import React from 'react';

export default function LoadingState({ activeJob }) {
  if (!activeJob) return null;

  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-6" id="state-loading">
      <div className="relative h-16 w-16">
        <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
        <div className="absolute inset-0 border-4 border-t-primary rounded-full animate-spin"></div>
      </div>
      <div className="text-center space-y-2">
        <h3 className="font-display-md text-on-surface text-xl font-bold">{activeJob.title}</h3>
        <p className="text-on-surface-variant text-label-sm opacity-60 text-xs font-mono">
          {activeJob.status === 'active' 
            ? `Worker executing pipeline... ${activeJob.progress}%` 
            : 'Connecting to global Redis cache & BullMQ workers...'}
        </p>
      </div>
      {/* Loading Live Progress bar */}
      <div className="w-full max-w-sm bg-canvas-dark border border-outline rounded-sm h-2.5 overflow-hidden">
        <div 
          className="bg-primary h-full transition-all duration-300"
          style={{ width: `${activeJob.progress || 5}%` }}
        />
      </div>
    </div>
  );
}
