import React from 'react';

export default function TabSelector({ activeTab, setActiveTab, setErrorMsg }) {
  const tabs = [
    { id: 'audio', label: 'MP3 Audio' },
    { id: 'video', label: 'MP4 Video' },
    { id: 'formats', label: 'All Streams' },
    { id: 'batch', label: 'Batch MP3' }
  ];

  return (
    <div className="space-y-2">
      <label className="font-caption-mono text-mute-dark uppercase tracking-widest text-[10px] block">Format Selection</label>
      <div className="flex flex-wrap p-1 bg-canvas-dark border border-outline rounded-md gap-1 max-w-fit">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => { setActiveTab(tab.id); setErrorMsg(''); }}
            className={`px-4 py-2 rounded-sm font-label-sm font-bold text-xs transition-all cursor-pointer ${
              activeTab === tab.id
                ? 'bg-primary text-white shadow-sm'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
