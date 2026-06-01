import React from 'react';

export default function DiagnosticsPanel({
  showDiag,
  setShowDiag,
  fetchDiagnostics,
  apiBase,
  setApiBase,
  adminKey,
  setAdminKey,
  diagnostics,
  diagError
}) {
  return (
    <section className="max-w-3xl mx-auto px-gutter pb-16">
      <div className="bg-surface-muted border border-hairline rounded-xl p-5 shadow-xl transition-all">
        <div 
          onClick={() => {
            const next = !showDiag;
            setShowDiag(next);
            if (next) fetchDiagnostics();
          }}
          className="flex justify-between items-center cursor-pointer select-none"
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-gradient-end">monitoring</span>
            <h4 className="font-display-md text-on-surface text-sm font-bold">Diagnostics Telemetry Console</h4>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-mute-dark font-medium">{showDiag ? 'Collapse Diagnostics' : 'Expand Diagnostics'}</span>
            <span className={`material-symbols-outlined transition-transform duration-300 text-mute-dark ${showDiag ? 'rotate-180' : ''}`}>
              expand_more
            </span>
          </div>
        </div>

        {showDiag && (
          <div className="mt-5 pt-4 border-t border-hairline space-y-4 animate-fade-in">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-col space-y-1">
                <span className="text-[10px] font-bold text-mute-dark uppercase tracking-wider block">API Endpoint Base</span>
                <input 
                  type="text"
                  value={apiBase}
                  onChange={(e) => setApiBase(e.target.value)}
                  placeholder="e.g. http://localhost:3000/api"
                  className="bg-canvas-dark border border-hairline rounded px-3 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary-container w-64 font-mono"
                />
              </div>

              <div className="flex flex-col space-y-1">
                <span className="text-[10px] font-bold text-mute-dark uppercase tracking-wider block">Bypass key (x-api-key)</span>
                <input 
                  type="password"
                  value={adminKey}
                  onChange={(e) => setAdminKey(e.target.value)}
                  placeholder="Paste admin secret key"
                  className="bg-canvas-dark border border-hairline rounded px-3 py-1.5 text-xs text-on-surface focus:outline-none focus:border-primary-container w-44 font-mono"
                />
              </div>

              <button 
                onClick={fetchDiagnostics}
                className="self-end px-4 py-2 bg-surface-container-highest hover:bg-surface-variant text-on-surface font-bold text-xs rounded transition-colors cursor-pointer border-0"
              >
                Refresh Telemetry
              </button>
            </div>

            {diagnostics ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
                <div className="bg-canvas-dark border border-hairline p-3 rounded-lg">
                  <span className="text-[9px] font-bold text-mute-dark uppercase tracking-wider block">Uptime</span>
                  <span className="text-sm font-extrabold text-white">{(diagnostics.uptimeSeconds / 60).toFixed(1)} mins</span>
                </div>
                <div className="bg-canvas-dark border border-hairline p-3 rounded-lg">
                  <span className="text-[9px] font-bold text-mute-dark uppercase tracking-wider block">Worker Count</span>
                  <span className="text-sm font-extrabold text-white">{diagnostics.activeWorkersCount || 0} threads</span>
                </div>
                <div className="bg-canvas-dark border border-hairline p-3 rounded-lg">
                  <span className="text-[9px] font-bold text-mute-dark uppercase tracking-wider block">Cache Hits</span>
                  <span className="text-sm font-extrabold text-emerald-400">{diagnostics.cacheMetrics?.hits || 0} hits</span>
                </div>
                <div className="bg-canvas-dark border border-hairline p-3 rounded-lg">
                  <span className="text-[9px] font-bold text-mute-dark uppercase tracking-wider block">Heap Used</span>
                  <span className="text-sm font-extrabold text-white">{((diagnostics.memoryHeapUsage?.heapUsed || 0) / (1024 * 1024)).toFixed(1)} MB</span>
                </div>
              </div>
            ) : diagError ? (
              <div className="p-3 bg-error-container/10 border border-error/20 rounded text-error font-mono text-xs">
                Failed to query Express endpoint: {diagError}. (Verify allowed origins in server or supply valid bypass headers)
              </div>
            ) : (
              <div className="text-xs text-mute-dark animate-pulse">Requesting system memory metrics from Redis and Express clusters...</div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
