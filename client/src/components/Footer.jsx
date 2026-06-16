import React from 'react';

export default function Footer() {
  return (
    <footer className="bg-canvas-dark border-t border-outline py-8 px-gutter">
      <div className="flex flex-col md:flex-row justify-between items-center w-full max-w-7xl mx-auto gap-6">
        <div className="flex flex-col items-center md:items-start gap-2">
          <span className="font-display-md text-base font-extrabold text-primary tracking-tight uppercase">StreamFetch</span>
          <p className="font-caption-mono text-caption-mono text-mute-dark text-xs">
            © 2026 StreamFetch Pipeline. Built for high-capacity digital stream extraction.
          </p>
        </div>
      </div>
    </footer>
  );
}
