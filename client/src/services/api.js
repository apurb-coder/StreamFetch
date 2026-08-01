import axios from 'axios';
import { sha256 } from '../utils/security';
import { getClientPoToken } from '../utils/poTokenGenerator';

const SECRET_FORMULA = 'yt2mp3_dynamic_secure_formula_salt_2026';

// Handshake / Token management
export const refreshHandshakeToken = async (apiBase, adminKey, force = false) => {
  if (adminKey) return null;
  try {
    const token = localStorage.getItem('yt2mp3_token');
    const tokenExpiry = localStorage.getItem('yt2mp3_token_expiry');
    
    // Refresh if missing, close to expiry (within 2 mins), or forced
    const isExpiringSoon = tokenExpiry && (Date.now() > parseInt(tokenExpiry, 10) - 120000);
    if (!token || !tokenExpiry || isExpiringSoon || force) {
      console.log('[Security] Proactively refreshing handshake token...');
      const response = await axios.get(`${apiBase}/handshake`);
      const data = response.data;
      if (data.success) {
        const newTokenExpiry = (Date.now() + data.expiresInMs - 30000).toString();
        localStorage.setItem('yt2mp3_token', data.token);
        localStorage.setItem('yt2mp3_token_expiry', newTokenExpiry);
        console.log('[Security] Ephemeral token refreshed. Expiry margin:', Math.round((data.expiresInMs - 30000) / 1000), 's');
        return { token: data.token, tokenExpiry: newTokenExpiry };
      }
    }
  } catch (err) {
    console.warn('[Security] Proactive handshake refresh failed:', err.message);
  }
  return null;
};

// Security headers builder
export const getSecurityHeaders = async (apiBase, adminKey, url = '') => {
  if (adminKey) {
    return {
      'x-api-key': adminKey,
      'Content-Type': 'application/json'
    };
  }

  let token = localStorage.getItem('yt2mp3_token');
  let tokenExpiry = localStorage.getItem('yt2mp3_token_expiry');

  if (!token || !tokenExpiry || Date.now() > parseInt(tokenExpiry, 10)) {
    await refreshHandshakeToken(apiBase, adminKey, true);
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

// API Endpoint calls
export const checkServer = async (apiBase) => {
  const response = await axios.get(`${apiBase}/handshake`);
  const data = response.data;
  if (data.success) {
    const tokenExpiry = (Date.now() + data.expiresInMs - 30000).toString();
    localStorage.setItem('yt2mp3_token', data.token);
    localStorage.setItem('yt2mp3_token_expiry', tokenExpiry);
  }
  return data;
};

export const extractMedia = async (apiBase, adminKey, urlInput, quality, activeTab) => {
  let endpoint = '/extract';
  let body = { url: urlInput, quality };

  if (activeTab === 'audio') {
    endpoint = '/extract';
    body = { url: urlInput };
  } else if (activeTab === 'formats') {
    endpoint = '/formats';
    body = { url: urlInput };
  }

  // Attach client-generated PoToken if available
  const { poToken, visitorData } = await getClientPoToken();
  if (poToken) {
    body.poToken = poToken;
  }
  if (visitorData) {
    body.visitorData = visitorData;
  }

  const headers = await getSecurityHeaders(apiBase, adminKey, urlInput);
  const response = await axios.post(`${apiBase}${endpoint}`, body, { headers });
  return response.data;
};

export const pollJobStatus = async (apiBase, jobId, type) => {
  const typeQuery = type === 'audio' ? '?type=audio' : type === 'formats' ? '?type=formats' : '';
  const response = await axios.get(`${apiBase}/extract/status/${jobId}${typeQuery}`);
  return response.data;
};

export const fetchDiagnostics = async (apiBase, adminKey) => {
  const response = await axios.get(`${apiBase}/stats`, {
    headers: {
      'x-api-key': adminKey || 'default_dev_key'
    }
  });
  return response.data;
};

export const downloadTrackAxios = async (url, type, onProgress, apiBase) => {
  let response;
  try {
    response = await axios.get(url, {
      responseType: 'arraybuffer',
      onDownloadProgress: (progressEvent) => {
        if (progressEvent.total) {
          onProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100));
        }
      }
    });
  } catch (e) {
    console.warn(`[FFmpeg.wasm] Direct axios fetch failed for ${type}. Routing through local Express proxy fallback...`);
    const proxyUrl = `${apiBase}/proxy?url=${encodeURIComponent(url)}`;
    response = await axios.get(proxyUrl, {
      responseType: 'arraybuffer',
      onDownloadProgress: (progressEvent) => {
        if (progressEvent.total) {
          onProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100));
        }
      }
    });
  }
  onProgress(100);
  return new Uint8Array(response.data);
};
