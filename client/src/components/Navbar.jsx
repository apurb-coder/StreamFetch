import React from 'react';

export default function Navbar({ serverStatus, checkServer }) {
  return (
    <nav className="bg-canvas-dark border-b border-hairline sticky top-0 z-50">
      <div className="flex justify-between items-center h-16 px-gutter w-full max-w-7xl mx-auto">
        <div className="flex items-center gap-8">
          <a className="flex items-center gap-2.5 font-display-md text-display-md font-bold text-gradient-end tracking-tighter" href="#">
            <img src="/favicon.png" alt="StreamFetch Logo" className="w-8 h-8 rounded-lg object-cover" />
            <span>StreamFetch</span>
          </a>
        </div>

        <div className="flex items-center gap-4">
          {/* Server Connection Status Badge */}
          <div 
            onClick={checkServer}
            className={`cursor-pointer flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold border ${
              serverStatus === 'online' 
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                : serverStatus === 'offline'
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
            }`}
            title="Click to manually check server status"
          >
            <span className={`w-2 h-2 rounded-full ${
              serverStatus === 'online' 
                ? 'bg-emerald-400 animate-pulse' 
                : serverStatus === 'offline'
                ? 'bg-amber-400 animate-pulse'
                : 'bg-zinc-400 animate-spin'
            }`} />
            <span className="hidden sm:inline">
              {serverStatus === 'online' ? 'Pipeline Connected' : serverStatus === 'offline' ? 'Server Offline' : 'Connecting...'}
            </span>
          </div>
        </div>
      </div>
    </nav>
  );
}
