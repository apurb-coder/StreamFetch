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
    this.poTokenServiceUrl = process.env.PO_TOKEN_SERVER_URL || 'https://service-url/token';
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
      const serviceUrl = process.env.PO_TOKEN_SERVER_URL;
      if (serviceUrl && serviceUrl.startsWith('http')) {
        const baseUrl = serviceUrl.replace(/\/+$/, '');
        const candidatePaths = [
          '/get_pot',
          '',
          '/get_potoken',
          '/token'
        ];

        for (const path of candidatePaths) {
          const targetUrl = baseUrl.endsWith(path) ? baseUrl : `${baseUrl}${path}`;
          
          // Try POST first, then GET
          for (const method of ['POST', 'GET']) {
            try {
              const response = await fetch(targetUrl, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: method === 'POST' ? JSON.stringify({}) : undefined,
                signal: AbortSignal.timeout(5000)
              });

              if (response.ok) {
                const data = await response.json();
                const token = data.poToken || data.po_token || data.token;
                const visitorData = data.contentBinding || data.visitorData || data.visitor_data;

                if (token) {
                  this.cachedToken = token;
                  this.cachedVisitorData = visitorData || null;
                  this.expiresAt = Date.now() + (3 * 60 * 60 * 1000);
                  console.log(`[PoTokenManager] Successfully retrieved fresh YouTube PoToken from ${targetUrl} via ${method}.`);
                  return { poToken: this.cachedToken, visitorData: this.cachedVisitorData };
                }
              }
            } catch (e) {
              // Try next candidate
            }
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
