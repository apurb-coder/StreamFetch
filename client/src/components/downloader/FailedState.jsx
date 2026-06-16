import React from 'react';

export default function FailedState({ activeJob, resetPrimaryJob }) {
  if (!activeJob || activeJob.status !== 'failed') return null;

  return (
    <div className="flex flex-col items-center justify-center py-10 space-y-6">
      <span className="material-symbols-outlined text-error text-5xl">warning</span>
      <div className="text-center space-y-2">
        <h3 className="font-display-md text-on-surface text-xl font-bold">Extraction Failed</h3>
        <p className="text-on-surface-variant text-label-sm opacity-60 text-xs">
          Pipeline was unable to extract stream elements for this target.
        </p>
        {activeJob.results?.error && (
          <div className="max-w-md mx-auto p-3 bg-error-container/10 border border-error/20 rounded-md text-error font-mono text-xs text-left overflow-x-auto whitespace-pre">
            Error: {activeJob.results.error}
          </div>
        )}
      </div>
      <button 
        className="bg-primary text-white hover:bg-primary-hover px-6 py-2.5 rounded-sm font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer border border-primary/20"
        onClick={resetPrimaryJob}
      >
        Return &amp; Try Again
      </button>
    </div>
  );
}
