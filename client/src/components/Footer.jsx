import React from 'react';

export default function Footer() {
  return (
    <footer className="bg-surface-container-lowest border-t border-hairline py-8 px-gutter">
      <div className="flex flex-col md:flex-row justify-between items-center w-full max-w-7xl mx-auto gap-6">
        <div className="flex flex-col items-center md:items-start gap-2">
          <span className="font-display-md text-lg font-bold text-on-surface tracking-wide">StreamFetch</span>
          <p className="font-caption-mono text-caption-mono text-mute-dark text-xs">
            © 2026 StreamFetch Pipeline. Built for high-capacity sandbox executions.
          </p>
        </div>
        <div className="flex gap-6">
          <a className="font-caption-mono text-caption-mono text-mute-dark hover:text-on-surface transition-colors text-xs" href="#">
            Terms
          </a>
          <a className="font-caption-mono text-caption-mono text-mute-dark hover:text-on-surface transition-colors text-xs" href="#">
            Privacy
          </a>
          <a className="font-caption-mono text-caption-mono text-mute-dark hover:text-on-surface transition-colors text-xs" href="#">
            GitHub
          </a>
          <a className="font-caption-mono text-caption-mono text-mute-dark hover:text-on-surface transition-colors text-xs" href="#">
            Status
          </a>
        </div>
      </div>
    </footer>
  );
}
