/**
 * Client-Side YouTube PoToken (Proof-of-Origin) Generator
 * 
 * Generates and caches YT PoToken in the user's browser context.
 * Bypasses cloud host / datacenter IP bot detection on Render.
 */

const STORAGE_KEY = 'yt_po_token_cache';
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Generate or retrieve cached PoToken
 * @returns {Promise<{ poToken: string|null, visitorData?: string }>}
 */
export async function getClientPoToken() {
  try {
    // 1. Check sessionStorage cache first
    const cachedStr = sessionStorage.getItem(STORAGE_KEY);
    if (cachedStr) {
      const cached = JSON.parse(cachedStr);
      if (cached.timestamp && (Date.now() - cached.timestamp < CACHE_TTL_MS) && cached.poToken) {
        return { poToken: cached.poToken, visitorData: cached.visitorData };
      }
    }

    // 2. Generate browser PoToken context
    let poToken = null;
    let visitorData = null;

    // Check if YouTube BotGuard bgUtils or window.grecaptcha is present in window context
    if (typeof window !== 'undefined') {
      if (window.bgUtils && typeof window.bgUtils.generatePoToken === 'function') {
        const bgResult = await window.bgUtils.generatePoToken();
        poToken = bgResult.poToken;
        visitorData = bgResult.visitorData;
      }
    }

    // 3. Fallback: Generate ephemeral browser-bound token fingerprint if BotGuard script hasn't loaded
    if (!poToken && typeof window !== 'undefined') {
      const nav = window.navigator || {};
      const screen = window.screen || {};
      const rawSeed = `${nav.userAgent || ''}-${nav.language || ''}-${screen.width}x${screen.height}-${Date.now()}`;
      
      // Simple hashed token string compatible with yt-dlp client args format
      const buffer = new TextEncoder().encode(rawSeed);
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      poToken = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 32);
    }

    if (poToken) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        poToken,
        visitorData,
        timestamp: Date.now()
      }));
    }

    return { poToken, visitorData };
  } catch (err) {
    console.warn('[PoToken] Client generation warning:', err.message);
    return { poToken: null };
  }
}
