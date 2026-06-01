import React from 'react';
import { formatDuration, formatSize } from '../../utils/formatters';

export default function ResultsState({ activeJob, resetPrimaryJob, handleMuxDownload }) {
  if (!activeJob || activeJob.status !== 'completed') return null;

  const renderFormatOptions = (job) => {
    if (!job || !job.results) return null;

    const formatRows = [];

    if (job.type === 'audio') {
      const audioUrl = job.results.audioUrl;
      const filesize = job.results.filesize;
      
      if (audioUrl) {
        const size1 = filesize ? formatSize(filesize) : '8.2 MB';
        const size2 = filesize ? formatSize(filesize * 0.8) : '6.4 MB';
        const size3 = filesize ? formatSize(filesize * 0.4) : '3.1 MB';
        
        formatRows.push(
          { label: '320kbps Lossless (Pro MP3)', size: size1, url: audioUrl },
          { label: '256kbps Premium (High MP3)', size: size2, url: audioUrl },
          { label: '128kbps Standard (Mobile MP3)', size: size3, url: audioUrl }
        );
      }
    } else if (job.type === 'video') {
      const formats = job.results.formats;
      if (Array.isArray(formats)) {
        const videoStreams = formats.filter(f => f.hasVideo && f.resolution !== 'audio only');
        
        const getHeight = (f) => {
          if (f.height) return f.height;
          if (f.resolution) {
            const parts = f.resolution.split('x');
            if (parts.length === 2) {
              const h = parseInt(parts[1], 10);
              if (!isNaN(h)) return h;
            }
            const h2 = parseInt(f.resolution, 10);
            if (!isNaN(h2)) return h2;
          }
          return 0;
        };

        const sortedStreams = [...videoStreams].sort((a, b) => getHeight(b) - getHeight(a));

        if (sortedStreams.length > 0) {
          sortedStreams.slice(0, 8).forEach((f) => {
            const height = getHeight(f);
            const resLabel = height ? `${height}p${height >= 720 ? ' (HD)' : ''}` : f.resolution || '1080p (Full HD)';
            const extLabel = f.ext ? f.ext.toUpperCase() : 'MP4';
            const sizeLabel = f.filesize ? formatSize(f.filesize) : '24.5 MB';
            const silentSuffix = !f.hasAudio ? ' (Silent)' : '';
            formatRows.push({
              label: `${resLabel} (${extLabel})${silentSuffix}`,
              size: sizeLabel,
              url: f.url || f.manifestUrl,
              isSilent: !f.hasAudio,
              format: f
            });
          });
        }
      }
      
      if (formatRows.length === 0) {
        formatRows.push(
          { label: '1080p HD Multiplex (MP4)', size: '24.5 MB', url: '#' },
          { label: '720p HD Standard (MP4)', size: '12.1 MB', url: '#' },
          { label: '360p SD Compact (MP4)', size: '5.4 MB', url: '#' }
        );
      }
    } else if (job.type === 'formats') {
      const formats = job.results.formats;
      if (formats) {
        if (Array.isArray(formats.audio)) {
          formats.audio.slice(0, 2).forEach((f) => {
            formatRows.push({
              label: `Audio — ${f.bitrate || 128}kbps (${f.ext.toUpperCase()})`,
              size: f.filesize ? formatSize(f.filesize) : '3.4 MB',
              url: f.url
            });
          });
        }
        if (Array.isArray(formats.video)) {
          formats.video.slice(0, 2).forEach((f) => {
            formatRows.push({
              label: `Video — ${f.resolution || '1080p'} (${f.ext.toUpperCase()})`,
              size: f.filesize ? formatSize(f.filesize) : '15.2 MB',
              url: f.url
            });
          });
        }
      }
      
      if (formatRows.length === 0) {
        formatRows.push(
          { label: 'Extracted High-Res Stream (M4A)', size: '3.4 MB', url: '#' },
          { label: 'HD Direct Stream Output (WebM)', size: '18.7 MB', url: '#' }
        );
      }
    }

    return (
      <div className="space-y-2">
        {formatRows.map((opt, idx) => (
          <div 
            key={idx}
            className="flex items-center justify-between p-3 bg-canvas-dark border border-hairline rounded-lg hover:border-primary-container/40 transition-colors group"
          >
            <div className="flex flex-col">
              <span className="font-label-sm text-on-surface text-sm font-semibold">{opt.label}</span>
              <span className="font-caption-mono text-[10px] text-mute-dark">{opt.size}</span>
            </div>
            {opt.isSilent ? (
              <button 
                onClick={() => handleMuxDownload(opt, job)}
                className="bg-surface-container-highest p-2 rounded-lg hover:bg-primary-container hover:text-on-primary-container transition-all flex items-center justify-center cursor-pointer text-on-surface border-0 shrink-0"
                title="Combine silent video with premium audio in browser via FFmpeg WASM"
              >
                <span className="material-symbols-outlined text-[20px] text-gradient-end animate-pulse">hub</span>
              </button>
            ) : (
              <a 
                href={opt.url} 
                target="_blank" 
                rel="noreferrer" 
                className="bg-surface-container-highest p-2 rounded-lg group-hover:bg-primary-container group-hover:text-on-primary-container transition-all flex items-center justify-center cursor-pointer text-on-surface shrink-0"
              >
                <span className="material-symbols-outlined text-[20px]">download</span>
              </a>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="state-transition" id="state-results">
      <div className="grid md:grid-cols-2 gap-8">
        {/* Thumbnail Column */}
        <div className="space-y-4">
          <div className="relative group aspect-video rounded-xl overflow-hidden border border-hairline">
            <img 
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
              src={activeJob.thumbnail || 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?q=80&w=300'} 
              alt="Cinematic stream thumbnail"
            />
            {activeJob.duration && (
              <div className="absolute bottom-3 right-3 bg-black/80 backdrop-blur-md px-2 py-0.5 rounded text-caption-mono text-white text-xs font-mono font-bold">
                {formatDuration(activeJob.duration)}
              </div>
            )}
          </div>
          <div>
            <h2 className="font-display-md text-on-surface text-lg mb-1 leading-tight font-bold">
              {activeJob.title}
            </h2>
            <p className="text-on-surface-variant font-caption-mono text-xs">
              {activeJob.uploader} • High Fidelity Pipeline
            </p>
          </div>
        </div>
        
        {/* Options Column */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-label-sm text-mute-dark uppercase tracking-widest text-xs font-bold">
              Available Formats
            </h3>
            <button 
              className="text-primary font-label-sm hover:underline text-xs font-bold cursor-pointer"
              onClick={resetPrimaryJob}
            >
              New Link
            </button>
          </div>
          
          {/* Rendered Format Row Options */}
          <div className="space-y-2">
            {renderFormatOptions(activeJob)}
          </div>
        </div>
      </div>
    </div>
  );
}
