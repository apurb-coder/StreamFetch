/**
 * Cookie Manager for yt-dlp Authentication
 * 
 * Handles decoding YT_COOKIES_BASE64 environment variables into a temporary
 * cookies.txt file for yt-dlp to pass YouTube bot detection on cloud hosts (Render/AWS).
 */

import fs from 'fs';
import path from 'path';

const COOKIE_FILE_PATH = '/tmp/youtube_cookies.txt';

class CookieManager {
  constructor() {
    this.initCookieFile();
  }

  /**
   * Decodes YT_COOKIES_BASE64 environment variable into /tmp/youtube_cookies.txt
   */
  initCookieFile() {
    try {
      const base64Cookies = process.env.YT_COOKIES_BASE64 || process.env.YT_COOKIES;
      
      if (!base64Cookies) {
        // If static file exists at config/cookies.txt, check that too
        const localPath = path.join(process.cwd(), 'config', 'cookies.txt');
        if (fs.existsSync(localPath)) {
          console.log('[CookieManager] Using local config/cookies.txt file.');
          return localPath;
        }
        return null;
      }

      // Decode base64 or raw string
      let cookieContent = base64Cookies.trim();
      
      // If base64 encoded (does not start with # Netscape), decode base64
      if (!cookieContent.startsWith('# Netscape') && !cookieContent.startsWith('# HTTP Cookie File')) {
        cookieContent = Buffer.from(cookieContent, 'base64').toString('utf8');
      }

      fs.writeFileSync(COOKIE_FILE_PATH, cookieContent, { mode: 0o600 });
      console.log(`[CookieManager] Decoded YouTube cookies to ${COOKIE_FILE_PATH} (${cookieContent.length} bytes)`);
      return COOKIE_FILE_PATH;
    } catch (err) {
      console.error('[CookieManager] Error initializing cookies file:', err.message);
      return null;
    }
  }

  /**
   * Returns path to cookie file if valid and exists
   * @returns {string|null}
   */
  getCookieFilePath() {
    if (fs.existsSync(COOKIE_FILE_PATH)) {
      return COOKIE_FILE_PATH;
    }
    const localPath = path.join(process.cwd(), 'config', 'cookies.txt');
    if (fs.existsSync(localPath)) {
      return localPath;
    }
    return null;
  }
}

export default new CookieManager();
