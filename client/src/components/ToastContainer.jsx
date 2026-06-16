import React from 'react';

export default function ToastContainer({ errorMsg, successMsg }) {
  if (!errorMsg && !successMsg) return null;

  return (
    <div className="max-w-3xl mx-auto px-gutter mb-6">
      {errorMsg && (
        <div className="flex items-center gap-3 p-4 bg-error-container border border-error/20 rounded-md text-error">
          <span className="material-symbols-outlined text-[20px]">warning</span>
          <p className="text-label-sm font-medium">{errorMsg}</p>
        </div>
      )}
      {successMsg && (
        <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-md text-emerald-400">
          <span className="material-symbols-outlined text-[20px]">check_circle</span>
          <p className="text-label-sm font-medium">{successMsg}</p>
        </div>
      )}
    </div>
  );
}
