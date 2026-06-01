export const formatDuration = (sec) => {
  if (!sec) return 'N/A';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

export const formatSize = (bytes) => {
  if (!bytes) return 'Unknown';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(2)} MB`;
};
