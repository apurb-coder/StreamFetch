import { useState, useEffect, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

// Import modular utilities
import { sha256 } from './utils/security';
import { formatDuration, formatSize } from './utils/formatters';

// Import modular components
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import ToastContainer from './components/ToastContainer';
import DownloaderCard from './components/DownloaderCard';
import QueueMonitor from './components/QueueMonitor';
import DiagnosticsPanel from './components/DiagnosticsPanel';
import BentoGrid from './components/BentoGrid';
import MuxingOverlay from './components/MuxingOverlay';
import Footer from './components/Footer';

const DEFAULT_API_BASE = 'http://localhost:3000/api';
const SECRET_FORMULA = 'yt2mp3_dynamic_secure_formula_salt_2026';

function App() {
  // Config state
  const [apiBase, setApiBase] = useState(DEFAULT_API_BASE);
  const [adminKey, setAdminKey] = useState(localStorage.getItem('yt2mp3_admin_key') || '');
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [serverStatus, setServerStatus] = useState('checking'); // 'online' | 'offline' | 'checking'

  // Input states
  const [activeTab, setActiveTab] = useState('audio'); // 'audio' | 'video' | 'formats' | 'batch'
  const [urlInput, setUrlInput] = useState('');
  const [batchUrls, setBatchUrls] = useState('');
  const [videoQuality, setVideoQuality] = useState('best');

  // Job states
  const [activeJobs, setActiveJobs] = useState([]);
  const [activeJobId, setActiveJobId] = useState(null); // Track primary job in downloader card
  const [diagnostics, setDiagnostics] = useState(null);
  const [showDiag, setShowDiag] = useState(false);
  const [diagError, setDiagError] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Frontend Muxing / FFmpeg WASM states
  const ffmpegRef = useRef(null);
  const [mergeState, setMergeState] = useState({
    status: 'idle', // 'idle' | 'downloading' | 'loading' | 'merging' | 'completed' | 'failed'
    videoProgress: 0,
    audioProgress: 0,
    mergeProgress: 0,
    details: '',
    error: ''
  });

  const handleMuxDownload = async (opt, job) => {
    const videoUrl = opt.url;
    
    // Find best audio URL (fallback check)
    let audioUrl = job.results?.audioUrl;
    if (!audioUrl && Array.isArray(job.results?.formats)) {
      const audioFormats = job.results.formats.filter(f => f.hasAudio && !f.hasVideo);
      const sortedAudio = [...audioFormats].sort((a, b) => {
        const brA = a.audioBitrate || a.totalBitrate || 0;
        const brB = b.audioBitrate || b.totalBitrate || 0;
        return brB - brA;
      });
      if (sortedAudio.length > 0) {
        audioUrl = sortedAudio[0].url || sortedAudio[0].manifestUrl;
      }
    }
    
    if (!videoUrl || !audioUrl) {
      showToast('Extraction failed to locate valid audio or video tracks.', 'error');
      return;
    }

    setMergeState({
      status: 'downloading',
      videoProgress: 0,
      audioProgress: 0,
      mergeProgress: 0,
      details: 'Spawning stream connections...',
      error: ''
    });

    try {
      const downloadTrack = async (url, type, onProgress) => {
        let response;
        try {
          response = await fetch(url);
          if (!response.ok) throw new Error('Direct stream blocked');
        } catch (e) {
          console.warn(`[FFmpeg.wasm] Direct fetch failed for ${type}. Routing through local Express proxy fallback...`);
          const proxyUrl = `${apiBase}/proxy?url=${encodeURIComponent(url)}`;
          response = await fetch(proxyUrl);
          if (!response.ok) {
            throw new Error(`Media pipeline rejected download for ${type} track.`);
          }
        }

        const contentLength = response.headers.get('content-length');
        if (!contentLength) {
          const blob = await response.blob();
          onProgress(100);
          return new Uint8Array(await blob.arrayBuffer());
        }

        const total = parseInt(contentLength, 10);
        let loaded = 0;
        const reader = response.body.getReader();
        const chunks = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          loaded += value.length;
          onProgress(Math.round((loaded / total) * 100));
        }

        const allChunks = new Uint8Array(total);
        let position = 0;
        for (const chunk of chunks) {
          allChunks.set(chunk, position);
          position += chunk.length;
        }
        return allChunks;
      };

      // 1. Download Video
      setMergeState(prev => ({ ...prev, details: 'Downloading silent high-resolution video stream...' }));
      const videoData = await downloadTrack(videoUrl, 'video', (prog) => {
        setMergeState(prev => ({ ...prev, videoProgress: prog }));
      });

      // 2. Download Audio
      setMergeState(prev => ({ ...prev, details: 'Downloading high-fidelity lossless audio track...' }));
      const audioData = await downloadTrack(audioUrl, 'audio', (prog) => {
        setMergeState(prev => ({ ...prev, audioProgress: prog }));
      });

      // 3. Load FFmpeg.wasm
      setMergeState(prev => ({ ...prev, status: 'loading', details: 'Activating frontend WebAssembly transcode engine...' }));
      if (!ffmpegRef.current) {
        ffmpegRef.current = new FFmpeg();
      }
      const ffmpeg = ffmpegRef.current;

      if (!ffmpeg.loaded) {
        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
        await ffmpeg.load({
          coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
          wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });
      }

      // 4. Run FFmpeg command to mux (no re-encoding, extremely fast copy)
      setMergeState(prev => ({ 
        ...prev, 
        status: 'merging', 
        details: 'Multiplexing digital streams locally in WebAssembly sandboxed memory...' 
      }));

      ffmpeg.on('progress', ({ progress }) => {
        setMergeState(prev => ({ ...prev, mergeProgress: Math.round(progress * 100) }));
      });

      const videoExt = opt.format?.ext || 'mp4';
      const inputVideo = `input_video.${videoExt}`;
      const inputAudio = 'input_audio.mp3';
      const outputVideo = 'output_merged.mp4';

      await ffmpeg.writeFile(inputVideo, videoData);
      await ffmpeg.writeFile(inputAudio, audioData);

      // Mux copying video stream intact and encoding audio to high quality AAC for standard MP4 playback
      await ffmpeg.exec([
        '-i', inputVideo,
        '-i', inputAudio,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-shortest',
        outputVideo
      ]);

      // Read output merged file
      const mergedData = await ffmpeg.readFile(outputVideo);
      const finalBlob = new Blob([mergedData.buffer], { type: 'video/mp4' });
      const downloadUrl = URL.createObjectURL(finalBlob);

      const link = document.createElement('a');
      link.href = downloadUrl;
      const cleanTitle = job.title?.replace(/[^a-zA-Z0-9]/g, '_') || 'StreamFetch_Multiplex';
      link.download = `${cleanTitle}_${opt.format?.resolution || 'HD'}.mp4`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Cleanup virtual FS memory
      try {
        await ffmpeg.deleteFile(inputVideo);
        await ffmpeg.deleteFile(inputAudio);
        await ffmpeg.deleteFile(outputVideo);
      } catch (e) {
        console.warn('[FFmpeg.wasm] Virtual memory clean failed:', e);
      }

      setMergeState(prev => ({
        ...prev,
        status: 'completed',
        details: 'Multiplex pipeline completed successfully. Delivery complete!'
      }));

      showToast('Multiplex download completed!');

      setTimeout(() => {
        setMergeState(prev => ({ ...prev, status: 'idle' }));
      }, 3500);

    } catch (err) {
      console.error('[FFmpeg Muxer] Critical failure:', err);
      setMergeState(prev => ({
        ...prev,
        status: 'failed',
        error: err.message || 'Muxing execution error.'
      }));
      showToast('Muxing failed: ' + err.message, 'error');
    }
  };

  // Persist admin key
  useEffect(() => {
    localStorage.setItem('yt2mp3_admin_key', adminKey);
  }, [adminKey]);

  // Check Server Status on mount
  useEffect(() => {
    checkServer();
  }, [apiBase]);

  // Periodic status poll for active background jobs
  useEffect(() => {
    const timer = setInterval(() => {
      activeJobs.forEach(job => {
        if (job.status !== 'completed' && job.status !== 'failed') {
          pollJobStatus(job.id, job.type);
        }
      });
    }, 1500);

    return () => clearInterval(timer);
  }, [activeJobs, isDemoMode]);

  const checkServer = async () => {
    setServerStatus('checking');
    try {
      const res = await fetch(`${apiBase}/handshake`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const tokenExpiry = (Date.now() + data.expiresInMs - 30000).toString();
          localStorage.setItem('yt2mp3_token', data.token);
          localStorage.setItem('yt2mp3_token_expiry', tokenExpiry);
        }
        setServerStatus('online');
        setIsDemoMode(false);
      } else {
        throw new Error('Not responding correctly');
      }
    } catch (e) {
      setServerStatus('offline');
      setIsDemoMode(true);
      showToast('Backend offline. Switched to Simulation Mode.', 'warning');
    }
  };

  const showToast = (msg, type = 'success') => {
    if (type === 'error') {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(''), 6000);
    } else {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(''), 6000);
    }
  };

  // Proactive token refresh helper
  const refreshHandshakeToken = async (force = false) => {
    if (adminKey) return;
    try {
      const token = localStorage.getItem('yt2mp3_token');
      const tokenExpiry = localStorage.getItem('yt2mp3_token_expiry');
      
      // Refresh if missing, close to expiry (within 2 mins), or forced
      const isExpiringSoon = tokenExpiry && (Date.now() > parseInt(tokenExpiry, 10) - 120000);
      if (!token || !tokenExpiry || isExpiringSoon || force) {
        console.log('[Security] Proactively refreshing handshake token...');
        const handshakeRes = await fetch(`${apiBase}/handshake`);
        const data = await handshakeRes.json();
        if (data.success) {
          const newTokenExpiry = (Date.now() + data.expiresInMs - 30000).toString();
          localStorage.setItem('yt2mp3_token', data.token);
          localStorage.setItem('yt2mp3_token_expiry', newTokenExpiry);
          console.log('[Security] Ephemeral token refreshed. Expiry margin:', Math.round((data.expiresInMs - 30000) / 1000), 's');
        }
      }
    } catch (err) {
      console.warn('[Security] Proactive handshake refresh failed:', err.message);
    }
  };

  // Periodic proactive handshake refresh scheduler
  useEffect(() => {
    if (isDemoMode) return;
    
    refreshHandshakeToken();
    
    const interval = setInterval(() => {
      refreshHandshakeToken();
    }, 30000); // Check every 30 seconds
    
    return () => clearInterval(interval);
  }, [apiBase, adminKey, isDemoMode]);

  // Cryptographic headers helper
  const getSecurityHeaders = async (url = '') => {
    if (adminKey) {
      return {
        'x-api-key': adminKey,
        'Content-Type': 'application/json'
      };
    }

    let token = localStorage.getItem('yt2mp3_token');
    let tokenExpiry = localStorage.getItem('yt2mp3_token_expiry');

    if (!token || !tokenExpiry || Date.now() > parseInt(tokenExpiry, 10)) {
      await refreshHandshakeToken(true);
      token = localStorage.getItem('yt2mp3_token');
      tokenExpiry = localStorage.getItem('yt2mp3_token_expiry');
      if (!token) {
        throw new Error('Handshake denied');
      }
    }

    const timestamp = Date.now().toString();
    const signatureInput = `${token}${timestamp}${url}${SECRET_FORMULA}`;
    const signature = await sha256(signatureInput);

    return {
      'x-app-token': token,
      'x-app-timestamp': timestamp,
      'x-app-signature': signature,
      'Content-Type': 'application/json'
    };
  };

  const handleConvert = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg('');

    const targetUrl = urlInput.trim();
    if (!targetUrl && activeTab !== 'batch') {
      showToast('Please enter a valid YouTube URL to proceed.', 'error');
      return;
    }

    if (activeTab === 'batch') {
      handleBatchConvert();
      return;
    }

    const jobId = 'job_' + Math.random().toString(36).substring(2, 9);
    const newJob = {
      id: jobId,
      url: targetUrl,
      type: activeTab,
      status: 'waiting',
      progress: 0,
      title: 'Connecting to pipeline...',
      duration: null,
      thumbnail: null,
      uploader: 'YouTube',
      results: null,
      addedAt: new Date().toLocaleTimeString()
    };

    // Add to top of active list and set as current primary active job
    setActiveJobs(prev => [newJob, ...prev]);
    setActiveJobId(jobId);
    setUrlInput('');

    if (isDemoMode) {
      simulateJobProgress(jobId, activeTab, targetUrl);
    } else {
      try {
        let endpoint = '/extract';
        let body = { url: targetUrl, quality: videoQuality };

        if (activeTab === 'audio') {
          endpoint = '/extract';
          body = { url: targetUrl };
        } else if (activeTab === 'formats') {
          endpoint = '/formats';
          body = { url: targetUrl };
        }

        const headers = await getSecurityHeaders(targetUrl);
        const res = await fetch(`${apiBase}${endpoint}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body)
        });

        const data = await res.json();
        if (res.status === 200 && data.cached) {
          // Instantly complete cached results
          const completedJob = {
            ...newJob,
            status: 'completed',
            progress: 100,
            title: data.data?.title || data.formats?.title || 'Extracted Cached Stream',
            duration: data.data?.duration || data.formats?.duration,
            thumbnail: data.data?.thumbnail || data.formats?.thumbnail || 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?q=80&w=300',
            uploader: data.data?.uploader || data.formats?.uploader || 'Cached CDN Node',
            results: data.data || data.formats
          };

          setActiveJobs(prev => prev.map(job => job.id === jobId ? completedJob : job));
          showToast('Loaded instantly from L1/L2 Cache!');
        } else if (res.status === 202) {
          // Standard background queuing path
          setActiveJobs(prev => prev.map(job => {
            if (job.id === jobId) {
              return { ...job, id: data.jobId, status: 'waiting' };
            }
            return job;
          }));
          setActiveJobId(data.jobId);
        } else {
          throw new Error(data.message || data.error || 'Conversion failed');
        }
      } catch (err) {
        setActiveJobs(prev => prev.map(job => {
          if (job.id === jobId) {
            return { ...job, status: 'failed', title: 'Extraction failed', results: { error: err.message } };
          }
          return job;
        }));
        showToast(err.message, 'error');
      }
    }
  };

  const handleBatchConvert = async () => {
    const urls = batchUrls
      .split('\n')
      .map(u => u.trim())
      .filter(u => u.startsWith('http'));

    if (urls.length === 0) {
      showToast('No valid URLs found in batch input', 'error');
      return;
    }
    if (urls.length > 10) {
      showToast('Maximum batch size is 10 URLs', 'error');
      return;
    }

    setBatchUrls('');
    showToast(`Queued ${urls.length} batch background tasks!`);

    for (const url of urls) {
      const jobId = 'batch_job_' + Math.random().toString(36).substring(2, 9);
      const newJob = {
        id: jobId,
        url: url,
        type: 'audio',
        status: 'waiting',
        progress: 0,
        title: 'Batch connecting...',
        duration: null,
        thumbnail: null,
        uploader: 'YouTube Batch',
        results: null,
        addedAt: new Date().toLocaleTimeString()
      };

      setActiveJobs(prev => [newJob, ...prev]);

      if (isDemoMode) {
        simulateJobProgress(jobId, 'audio', url);
      } else {
        try {
          const headers = await getSecurityHeaders(url);
          const res = await fetch(`${apiBase}/extract`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ url })
          });
          const data = await res.json();
          if (res.status === 200 && data.cached) {
            setActiveJobs(prev => prev.map(job => {
              if (job.id === jobId) {
                return {
                  ...job,
                  status: 'completed',
                  progress: 100,
                  title: data.data?.title || 'Extracted Audio',
                  duration: data.data?.duration,
                  thumbnail: data.data?.thumbnail,
                  uploader: data.data?.uploader || 'Batch CDN Node',
                  results: data.data
                };
              }
              return job;
            }));
          } else if (res.status === 202) {
            setActiveJobs(prev => prev.map(job => {
              if (job.id === jobId) {
                return { ...job, id: data.jobId };
              }
              return job;
            }));
          } else {
            throw new Error(data.error || 'Failed batch setup');
          }
        } catch (err) {
          setActiveJobs(prev => prev.map(job => {
            if (job.id === jobId) {
              return { ...job, status: 'failed', title: 'Failed batch entry', results: { error: err.message } };
            }
            return job;
          }));
        }
      }
    }
  };

  // Poll real job status
  const pollJobStatus = async (jobId, type) => {
    if (isDemoMode || jobId.toString().startsWith('job_') || jobId.toString().startsWith('batch_job_')) return;
    
    try {
      const typeQuery = type === 'audio' ? '?type=audio' : type === 'formats' ? '?type=formats' : '';
      const res = await fetch(`${apiBase}/extract/status/${jobId}${typeQuery}`);
      const data = await res.json();

      if (data.success) {
        setActiveJobs(prev => prev.map(job => {
          if (job.id === jobId) {
            if (data.status === 'completed') {
              const resData = data.data || data.formats;
              return {
                ...job,
                status: 'completed',
                progress: 100,
                title: resData?.title || 'Extraction Successful',
                duration: resData?.duration,
                thumbnail: resData?.thumbnail || 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?q=80&w=300',
                uploader: resData?.uploader || 'YouTube',
                results: resData
              };
            } else if (data.status === 'failed') {
              return {
                ...job,
                status: 'failed',
                progress: 0,
                title: 'Extraction failed',
                results: { error: data.error || 'Job failed on worker thread' }
              };
            } else {
              return {
                ...job,
                status: data.status, // 'active' | 'waiting'
                progress: data.progress || 10,
                title: data.status === 'active' ? 'Extracting metadata via yt-dlp...' : 'Waiting in BullMQ queue...'
              };
            }
          }
          return job;
        }));
      }
    } catch (err) {
      console.error("Polling error:", err);
    }
  };

  // Simulated progress for Demo Mode
  const simulateJobProgress = (jobId, type, url) => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.floor(Math.random() * 15) + 8;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        
        let mockTitle = "High-Performance Edge CDN Streaming Engine";
        try {
          const match = url.match(/[?&]v=([^&#]*)/);
          if (match && match[1]) mockTitle = `YouTube Stream [ID: ${match[1]}]`;
        } catch(e){}

        setActiveJobs(prev => prev.map(job => {
          if (job.id === jobId) {
            return {
              ...job,
              status: 'completed',
              progress: 100,
              title: mockTitle,
              duration: 642,
              thumbnail: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?q=80&w=300',
              uploader: 'TechStream Engineering',
              results: {
                audioUrl: '#',
                ext: 'mp3',
                audioBitrate: 320,
                filesize: 8402918,
                formats: [
                  { formatId: '140', ext: 'm4a', bitrate: 128, filesize: 3450289, url: '#' },
                  { formatId: '251', ext: 'webm', bitrate: 142, filesize: 3720391, url: '#' }
                ]
              }
            };
          }
          return job;
        }));
        showToast('Extraction simulation complete!');
      } else {
        setActiveJobs(prev => prev.map(job => {
          if (job.id === jobId) {
            return {
              ...job,
              status: progress > 30 ? 'active' : 'waiting',
              progress: progress,
              title: progress > 30 ? 'Extracting codec elements...' : 'Acquiring worker thread...'
            };
          }
          return job;
        }));
      }
    }, 500);
  };

  // Fetch telemetry diagnostics
  const fetchDiagnostics = async () => {
    setDiagError(null);
    try {
      const res = await fetch(`${apiBase}/stats`, {
        headers: {
          'x-api-key': adminKey || 'default_dev_key'
        }
      });
      const data = await res.json();
      if (data.success) {
        setDiagnostics(data);
      } else {
        throw new Error(data.message || 'Unauthorized api-key');
      }
    } catch (err) {
      setDiagError(err.message);
      showToast('Telemetry Access Denied', 'error');
    }
  };

  const removeJob = (id) => {
    setActiveJobs(prev => prev.filter(j => j.id !== id));
    if (activeJobId === id) {
      setActiveJobId(null);
    }
  };

  const resetPrimaryJob = () => {
    setActiveJobId(null);
    setUrlInput('');
  };

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrlInput(text);
      showToast('YouTube URL pasted from clipboard');
    } catch (err) {
      showToast('Could not access clipboard. Paste manually.', 'error');
    }
  };

  // Active Job selector for Downloader UI Card
  const activeJob = activeJobs.find(j => j.id === activeJobId);

  return (
    <div className="min-h-screen bg-canvas-dark text-on-surface font-body-md selection:bg-primary-container selection:text-on-primary-container">
      {/* TopNavBar */}
      <Navbar 
        serverStatus={serverStatus} 
        checkServer={checkServer} 
      />

      {/* Main Container */}
      <main className="mesh-gradient min-h-screen pb-12">
        {/* Hero Section */}
        <Hero />

        {/* Floating Alert Messages */}
        <ToastContainer 
          errorMsg={errorMsg} 
          successMsg={successMsg} 
        />

        {/* Tool Canvas Downloader Card */}
        <DownloaderCard
          activeJob={activeJob}
          handleConvert={handleConvert}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          setErrorMsg={setErrorMsg}
          urlInput={urlInput}
          setUrlInput={setUrlInput}
          batchUrls={batchUrls}
          setBatchUrls={setBatchUrls}
          pasteFromClipboard={pasteFromClipboard}
          resetPrimaryJob={resetPrimaryJob}
          handleMuxDownload={handleMuxDownload}
        />

        {/* Queue History Activity Monitor */}
        <QueueMonitor
          activeJobs={activeJobs}
          setActiveJobs={setActiveJobs}
          setActiveJobId={setActiveJobId}
          activeJobId={activeJobId}
          removeJob={removeJob}
        />

        {/* Diagnostics Telemetry Panel */}
        <DiagnosticsPanel
          showDiag={showDiag}
          setShowDiag={setShowDiag}
          fetchDiagnostics={fetchDiagnostics}
          apiBase={apiBase}
          setApiBase={setApiBase}
          adminKey={adminKey}
          setAdminKey={setAdminKey}
          diagnostics={diagnostics}
          diagError={diagError}
        />

        {/* Social Proof Bento Grid */}
        <BentoGrid />
      </main>

      {/* Dynamic Cyberpunk FFmpeg.wasm Multiplex Merging HUD Overlay */}
      <MuxingOverlay 
        mergeState={mergeState} 
        setMergeState={setMergeState} 
      />

      {/* Footer */}
      <Footer />
    </div>
  );
}

export default App;
