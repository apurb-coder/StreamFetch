import React from 'react';

export default function BentoGrid() {
  return (
    <section className="max-w-7xl mx-auto px-gutter pb-12">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-surface border border-hairline p-8 rounded-lg space-y-4 hover:border-primary transition-all duration-300 relative group overflow-hidden">
          <div className="flex justify-between items-center">
            <span className="material-symbols-outlined text-primary text-2xl group-hover:scale-110 transition-transform">speed</span>
          </div>
          <h4 className="font-display-md text-on-surface text-lg font-bold uppercase tracking-tight">Unmatched Speed</h4>
          <p className="text-on-surface-variant opacity-70 text-sm leading-relaxed">
            Leveraging distributed edge queue workers to process and deliver high-fidelity content extractions in seconds.
          </p>
        </div>

        <div className="bg-surface border border-hairline p-8 rounded-lg space-y-4 hover:border-primary transition-all duration-300 relative group overflow-hidden">
          <div className="flex justify-between items-center">
            <span className="material-symbols-outlined text-primary text-2xl group-hover:scale-110 transition-transform">high_quality</span>
          </div>
          <h4 className="font-display-md text-on-surface text-lg font-bold uppercase tracking-tight">Lossless Quality</h4>
          <p className="text-on-surface-variant opacity-70 text-sm leading-relaxed">
            Download up to 4K resolution streams and high-bitrate 320kbps audio files without any compression artifacts.
          </p>
        </div>

        <div className="bg-surface border border-hairline p-8 rounded-lg space-y-4 hover:border-primary transition-all duration-300 relative group overflow-hidden">
          <div className="flex justify-between items-center">
            <span className="material-symbols-outlined text-primary text-2xl group-hover:scale-110 transition-transform">security</span>
          </div>
          <h4 className="font-display-md text-on-surface text-lg font-bold uppercase tracking-tight">Safe &amp; Ad-free</h4>
          <p className="text-on-surface-variant opacity-70 text-sm leading-relaxed">
            No intrusive ads, no script payloads. Just a secure, high-performance web client engineered for safety.
          </p>
        </div>
      </div>
    </section>
  );
}
