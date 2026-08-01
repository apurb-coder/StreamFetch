/**
 * Server-Side YouTube PoToken (Proof-of-Origin) Manager
 * 
 * Generates and caches real YouTube BotGuard PoTokens on the server IP.
 * Solves YouTube bot verification challenges without requiring account cookies.
 */

class PoTokenManager {
  constructor() {
    this.cachedToken = null;
    this.cachedVisitorData = null;
    this.expiresAt = 0;

    // External or local PoToken provider endpoint
    this.poTokenServiceUrl = process.env.PO_TOKEN_SERVER_URL || 'https://bgutil-ytdlp-potoken-generator.onrender.com/token';
  }

  /**
   * Fetches fresh PoToken & visitorData from server-side generator
   * @returns {Promise<{ poToken: string|null, visitorData: string|null }>}
   */
  async getPoToken() {
    // 1. Return cached token if valid (Tokens last ~2-4 hours)
    if (this.cachedToken && Date.now() < this.expiresAt) {
      return { poToken: this.cachedToken, visitorData: this.cachedVisitorData };
    }

    // 2. Fetch fresh token from PoToken service
    try {
      if (this.poTokenServiceUrl) {
        const response = await fetch(this.poTokenServiceUrl, { signal: AbortSignal.timeout(8000) });
        if (response.ok) {
          const data = await response.json();
          if (data && (data.poToken || data.po_token)) {
            this.cachedToken = data.poToken || data.po_token;
            this.cachedVisitorData = data.visitorData || data.visitor_data || null;
            this.expiresAt = Date.now() + (3 * 60 * 60 * 1000); // Cache for 3 hours
            console.log('[PoTokenManager] Successfully retrieved fresh YouTube PoToken from server generator.');
            return { poToken: this.cachedToken, visitorData: this.cachedVisitorData };
          }
        }
      }
    } catch (err) {
      console.warn('[PoTokenManager] Primary PoToken server request failed:', err.message);
    }

    // 3. Fallback: Return env fallback if configured
    if (process.env.YT_PO_TOKEN) {
      return {
        poToken: process.env.YT_PO_TOKEN,
        visitorData: process.env.YT_VISITOR_DATA || null
      };
    }

    return { poToken: null, visitorData: null };
  }

  /**
   * Invalidates current token when yt-dlp encounters 403 or bot error
   */
  invalidateCache() {
    this.cachedToken = null;
    this.cachedVisitorData = null;
    this.expiresAt = 0;
  }
}

export default new PoTokenManager();
