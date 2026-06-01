import React from 'react';

export default function BentoGrid() {
  return (
    <section className="max-w-7xl mx-auto px-gutter pb-12">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-surface-muted border border-hairline p-8 rounded-xl space-y-4 hover:border-primary/30 transition-all group">
          <span className="material-symbols-outlined text-gradient-end text-3xl">speed</span>
          <h4 className="font-display-md text-on-surface text-lg font-bold">Unmatched Speed</h4>
          <p className="text-on-surface-variant opacity-70 text-sm">
            Leveraging distributed edge queue workers to process and deliver high-fidelity content extractions in seconds.
          </p>
        </div>
        <div className="bg-surface-muted border border-hairline p-8 rounded-xl space-y-4 hover:border-primary/30 transition-all group">
          <span className="material-symbols-outlined text-gradient-end text-3xl">high_quality</span>
          <h4 className="font-display-md text-on-surface text-lg font-bold">Lossless Quality</h4>
          <p className="text-on-surface-variant opacity-70 text-sm">
            Download up to 4K resolution streams and high-bitrate 320kbps audio files without any compression artifacts.
          </p>
        </div>
        <div className="bg-surface-muted border border-hairline p-8 rounded-xl space-y-4 hover:border-primary/30 transition-all group">
          <span className="material-symbols-outlined text-gradient-end text-3xl">security</span>
          <h4 className="font-display-md text-on-surface text-lg font-bold">Safe &amp; Ad-free</h4>
          <p className="text-on-surface-variant opacity-70 text-sm">
            No intrusive ads, no script payloads. Just a secure, high-performance developer sandbox engineered for safety.
          </p>
        </div>
      </div>
    </section>
  );
}
