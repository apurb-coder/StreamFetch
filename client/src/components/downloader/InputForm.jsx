import React from 'react';
import TabSelector from './TabSelector';

export default function InputForm({
  handleConvert,
  activeTab,
  setActiveTab,
  setErrorMsg,
  urlInput,
  setUrlInput,
  batchUrls,
  setBatchUrls,
  pasteFromClipboard
}) {
  return (
    <form onSubmit={handleConvert} className="space-y-6">
      
      {/* Format selection header tabs */}
      <TabSelector 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        setErrorMsg={setErrorMsg} 
      />

      {/* Input Text / Textarea depending on ActiveTab */}
      <div className="space-y-2">
        <label className="font-caption-mono text-mute-dark uppercase tracking-widest text-xs block">
          {activeTab === 'batch' ? 'Batch YouTube URLs (One per line, Max 10)' : 'Video URL'}
        </label>
        
        {activeTab !== 'batch' ? (
          <div className="relative group">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-mute-dark flex items-center">
              <span className="material-symbols-outlined">link</span>
            </div>
            <input 
              className="w-full h-input-height bg-canvas-dark border border-outline rounded-md pl-12 pr-24 text-on-surface placeholder:text-mute-dark focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all font-medium text-sm"
              id="url-input" 
              placeholder="Paste your YouTube link here..." 
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
            />
            <button 
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-surface border border-outline text-on-surface px-4 py-1.5 rounded-sm text-xs font-semibold hover:border-accent transition-colors cursor-pointer" 
              onClick={pasteFromClipboard}
            >
              Paste
            </button>
          </div>
        ) : (
          <div>
            <textarea 
              rows="4"
              className="w-full bg-canvas-dark border border-outline rounded-md p-4 text-on-surface placeholder:text-mute-dark focus:border-primary focus:ring-1 focus:ring-primary focus:outline-none transition-all font-mono text-sm leading-relaxed"
              placeholder="Paste multiple links (one per line, e.g.)&#13;https://www.youtube.com/watch?v=123&#13;https://www.youtube.com/watch?v=456"
              value={batchUrls}
              onChange={(e) => setBatchUrls(e.target.value)}
            />
          </div>
        )}
      </div>

      {/* Submit row & Extra option */}
      <div className="flex flex-col md:flex-row gap-6 items-end">
        <div className="w-full md:flex-1">
          <button 
            type="submit"
            className="w-full h-input-height bg-primary text-white font-display-md flex items-center justify-center gap-3 rounded-sm hover:bg-primary-hover active:scale-[0.98] transition-all cursor-pointer text-base uppercase font-bold tracking-wider border border-primary/20 shadow-md hover:shadow-primary/10"
          >
            <span className="material-symbols-outlined">bolt</span>
            {activeTab === 'batch' ? 'Enqueue Batch Task' : 'Fetch Content'}
          </button>
        </div>
      </div>
    </form>
  );
}
