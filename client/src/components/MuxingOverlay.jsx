import React from 'react';

export default function MuxingOverlay({ mergeState, setMergeState }) {
  if (mergeState.status === 'idle') return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in animate-duration-300">
      <div className="relative w-full max-w-lg bg-surface border border-outline rounded-lg p-6 md:p-8 shadow-2xl space-y-6 overflow-hidden">
        {/* Top scanning grid lines animation */}
        <div className="absolute inset-0 bg-grid-pattern opacity-[0.03] pointer-events-none" />
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-primary/45" />

        {/* Header info */}
        <div className="flex items-center gap-4 relative">
          <div className="bg-primary-container/20 p-3 rounded-sm border border-primary/20 text-primary">
            <span className="material-symbols-outlined text-[32px]">hub</span>
          </div>
          <div>
            <h3 className="font-display-md text-on-surface text-xl font-bold tracking-tight uppercase">
              Frontend Muxing Pipeline
            </h3>
            <p className="font-caption-mono text-mute-dark text-xs uppercase tracking-wider">
              Engine Status: <span className="text-primary font-semibold">{mergeState.status}</span>
            </p>
          </div>
        </div>

        {/* Description logs */}
        <div className="bg-canvas-dark border border-outline p-4 rounded-lg space-y-3 font-mono text-xs text-mute-dark">
          <div className="flex items-center justify-between text-on-surface">
            <span>Task Stream:</span>
            <span className="text-primary font-bold">Muxing High-Res Audio/Video</span>
          </div>
          <div className="h-[1px] bg-outline" />
          <div className="space-y-2 font-caption-mono">
            {/* Step 1: Download Video */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`material-symbols-outlined text-[16px] ${
                  mergeState.videoProgress === 100 ? 'text-emerald-400' : 'text-primary animate-pulse'
                }`}>
                  {mergeState.videoProgress === 100 ? 'check_circle' : 'download'}
                </span>
                <span>HD Video Stream Download</span>
              </div>
              <span className="font-bold text-on-surface">{mergeState.videoProgress}%</span>
            </div>
            <div className="w-full bg-canvas-dark border border-outline h-1.5 rounded-sm overflow-hidden">
              <div 
                className="bg-primary h-full transition-all duration-200" 
                style={{ width: `${mergeState.videoProgress}%` }}
              />
            </div>

            {/* Step 2: Download Audio */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`material-symbols-outlined text-[16px] ${
                  mergeState.audioProgress === 100 ? 'text-emerald-400' : 'text-primary animate-pulse'
                }`}>
                  {mergeState.audioProgress === 100 ? 'check_circle' : 'download'}
                </span>
                <span>Hi-Fi Audio Stream Download</span>
              </div>
              <span className="font-bold text-on-surface">{mergeState.audioProgress}%</span>
            </div>
            <div className="w-full bg-canvas-dark border border-outline h-1.5 rounded-sm overflow-hidden">
              <div 
                className="bg-primary h-full transition-all duration-200" 
                style={{ width: `${mergeState.audioProgress}%` }}
              />
            </div>

            {/* Step 3: FFmpeg compiler */}
            {(mergeState.status === 'loading' || mergeState.status === 'merging' || mergeState.status === 'completed') && (
              <div className="flex items-center justify-between animate-fade-in">
                <div className="flex items-center gap-2">
                  <span className={`material-symbols-outlined text-[16px] ${
                    mergeState.status !== 'loading' ? 'text-emerald-400' : 'text-primary animate-spin'
                  }`}>
                    {mergeState.status !== 'loading' ? 'check_circle' : 'sync'}
                  </span>
                  <span>Initialize WebAssembly Engine</span>
                </div>
                <span className="font-bold text-emerald-400">Ready</span>
              </div>
            )}

            {/* Step 4: Merging Progress */}
            {mergeState.status === 'merging' && (
              <div className="space-y-2 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[16px] text-primary animate-spin">
                      progress_activity
                    </span>
                    <span>Muxing Tracks in WebAssembly memory</span>
                  </div>
                  <span className="font-bold text-on-surface">{mergeState.mergeProgress}%</span>
                </div>
                <div className="w-full bg-canvas-dark border border-outline h-1.5 rounded-sm overflow-hidden">
                  <div 
                    className="bg-primary h-full transition-all duration-200" 
                    style={{ width: `${mergeState.mergeProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Current details status */}
        <div className="text-center space-y-2">
          {mergeState.status === 'failed' ? (
            <div className="p-4 bg-error-container/10 border border-error/20 rounded-lg space-y-2 text-left">
              <div className="flex items-center gap-2 text-error font-bold text-sm uppercase font-display-md tracking-tight">
                <span className="material-symbols-outlined">warning</span>
                <span>Pipeline Muxing Interrupted</span>
              </div>
              <p className="text-xs text-mute-dark font-mono break-all">{mergeState.error}</p>
            </div>
          ) : (
            <p className="text-on-surface-variant text-sm font-semibold animate-pulse text-white">
              {mergeState.details}
            </p>
          )}
        </div>

        {/* Buttons row */}
        <div className="flex items-center justify-center pt-2 font-body-md">
          {mergeState.status === 'failed' ? (
            <button
              type="button"
              onClick={() => setMergeState(prev => ({ ...prev, status: 'idle' }))}
              className="bg-error-container/20 text-error hover:bg-error-container/30 px-6 py-2.5 rounded-sm text-xs font-bold transition-all cursor-pointer border-0 uppercase tracking-wider"
            >
              Dismiss & Return
            </button>
          ) : mergeState.status === 'completed' ? (
            <div className="flex items-center gap-2 text-emerald-400 text-sm font-bold animate-bounce uppercase font-display-md tracking-tight">
              <span className="material-symbols-outlined">check_circle</span>
              <span>Pipeline Execution Completed!</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                // Quick reload or reset to cancel
                window.location.reload();
              }}
              className="text-xs text-mute-dark hover:text-error transition-colors font-bold cursor-pointer underline border-0 bg-transparent uppercase tracking-wider font-caption-mono"
            >
              Abort Muxing Task
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
