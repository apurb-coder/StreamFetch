import React from 'react';
import { formatDuration } from '../utils/formatters';

export default function QueueMonitor({
  activeJobs,
  setActiveJobs,
  setActiveJobId,
  activeJobId,
  removeJob
}) {
  if (activeJobs.length === 0) return null;

  return (
    <section className="max-w-3xl mx-auto px-gutter pb-16">
      <div className="bg-surface border border-outline rounded-lg p-6 shadow-none space-y-4">
        <div className="flex items-center justify-between border-b border-outline pb-4">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl">analytics</span>
            <h3 className="font-display-md text-on-surface text-md font-bold uppercase tracking-tight">Queue Execution Monitor</h3>
            <span className="bg-primary/20 text-primary text-[10px] px-2 py-0.5 rounded-sm font-bold font-caption-mono">
              {activeJobs.length} JOB{activeJobs.length > 1 ? 'S' : ''}
            </span>
          </div>
          <button 
            onClick={() => { setActiveJobs([]); setActiveJobId(null); }}
            className="text-xs text-mute-dark hover:text-on-surface transition-colors font-bold cursor-pointer bg-transparent border-0"
          >
            Clear All Logs
          </button>
        </div>

        <div className="flex flex-col divide-y divide-outline">
          {activeJobs.map(job => (
            <div key={job.id} className="py-3.5 first:pt-2 last:pb-0 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
              
              <div className="flex gap-3 items-center min-w-0">
                {/* Miniature thumbnail or loading ring */}
                <div className="w-16 h-10 rounded bg-canvas-dark border border-outline overflow-hidden shrink-0 flex items-center justify-center relative">
                  {job.thumbnail ? (
                    <img src={job.thumbnail} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className={`w-4 h-4 rounded-full border-2 border-t-primary border-primary/20 ${job.status !== 'completed' && job.status !== 'failed' ? 'animate-spin' : ''}`} />
                  )}
                  {job.duration && (
                    <span className="absolute bottom-0.5 right-0.5 bg-black/80 text-[8px] px-1 rounded-md font-mono text-white">
                      {formatDuration(job.duration)}
                    </span>
                  )}
                </div>

                {/* Job Metadata details */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-sm ${
                      job.status === 'completed' 
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : job.status === 'failed'
                        ? 'bg-error-container/20 text-error'
                        : 'bg-primary/20 text-primary animate-pulse'
                    }`}>
                      {job.status}
                    </span>
                    <span className="text-[10px] text-mute-dark font-mono font-medium">{job.addedAt}</span>
                  </div>
                  <h4 className="text-sm font-semibold text-on-surface truncate pr-4 mt-0.5 max-w-sm font-body-md" title={job.title}>
                    {job.title}
                  </h4>
                </div>
              </div>

              {/* Progress Bar & Buttons */}
              <div className="flex items-center gap-4 w-full md:w-auto shrink-0 justify-between md:justify-end">
                {job.status !== 'completed' && job.status !== 'failed' && (
                  <div className="w-24 bg-canvas-dark border border-outline rounded-sm h-1.5 overflow-hidden">
                    <div 
                      className="bg-primary h-full transition-all duration-300"
                      style={{ width: `${job.progress || 5}%` }}
                    />
                  </div>
                )}

                <div className="flex items-center gap-2">
                  {/* If completed, show selector or quick download */}

                  {job.status === 'failed' && (
                    <button 
                      onClick={() => { setActiveJobId(job.id); }}
                      className="bg-error-container/10 text-error hover:bg-error-container/20 text-xs px-2.5 py-1.5 rounded-sm transition-all font-bold cursor-pointer border-0"
                    >
                      Show Error
                    </button>
                  )}
                  
                  <button 
                    onClick={() => removeJob(job.id)}
                    className="text-mute-dark hover:text-error hover:bg-error-container/10 p-1.5 rounded-md transition-colors flex items-center justify-center cursor-pointer bg-transparent border-0"
                    title="Remove job from logs"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>

              </div>

            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
