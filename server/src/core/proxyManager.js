/**
 * Proxy Manager and Health Supervisor
 * 
 * Aggregates proxy servers from multiple channels:
 *  - Webshare API/List
 *  - Oracle instances
 *  - Tor localhost SOCKS5 tunnel
 *  - Failover `config/proxies.txt` file database
 * 
 * Automatically schedules background HTTP health validations using curl/fetch
 * to discard dead/blocked proxy gateways and maintain a pool of healthy tunnels.
 */

const fs = require('fs').promises;
const path = require('path');
const { exec } = require('child_process');
const config = require('../../config/default');

class ProxyManager {
  constructor() {
    this.proxies = [];               // All registered raw proxy strings
    this.healthyProxies = [];        // Filtered pool of verified active gateways
    this.failedProxies = new Map();  // Keeps track of error counts per proxy (proxy => failCount)
    this.lastRotation = Date.now();
    this.rotationInterval = 300000;  // Rotate/reshuffle active pool every 5 minutes
    this.maxFailures = 3;            // Discard proxy after 3 consecutive connection failures

    // Trigger asynchronous boot initialization
    this.initializeProxies();
  }

  /**
   * Boots the proxy pooling schedules
   */
  async initializeProxies() {
    console.log('[ProxyManager] Initializing proxy pools...');
    
    try {
      // 1. Gather proxies from configurations
      this.loadConfigProxies();

      // 2. Load proxies from config/proxies.txt file fallback
      await this.loadCustomProxies();

      // 3. Perform initial health audit
      await this.healthCheck();

      // 4. Register background validation scheduler (Runs every 5 minutes)
      setInterval(() => this.healthCheck(), 300000);

    } catch (error) {
      console.error('[ProxyManager] Boot initialization error:', error);
    }
  }

  /**
   * Gathers configured list items from process env or configs
   */
  loadConfigProxies() {
    // Add Tor socks server if active
    if (config.proxies.useTor) {
      this.proxies.push('socks5://127.0.0.1:9050');
    }

    // Add configured premium list arrays
    if (config.proxies.webshare.length > 0) {
      this.proxies.push(...config.proxies.webshare);
    }
    if (config.proxies.oracle.length > 0) {
      this.proxies.push(...config.proxies.oracle);
    }
  }

  /**
   * Fallback loader: reads proxies list file in config/proxies.txt
   */
  async loadCustomProxies() {
    const proxyFilePath = path.join(__dirname, '..', '..', 'config', 'proxies.txt');
    try {
      const data = await fs.readFile(proxyFilePath, 'utf8');
      const lines = data.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
      
      this.proxies.push(...lines);
      console.log(`[ProxyManager] Loaded ${lines.length} proxies from proxies.txt`);
    } catch (err) {
      console.log('[ProxyManager] No custom proxies.txt loaded or file is empty.');
    }
  }

  /**
   * Loops over registered proxies to verify availability and speed
   */
  async healthCheck() {
    console.log(`[ProxyManager] Auditing proxy health pool of ${this.proxies.length} gateways...`);
    
    if (this.proxies.length === 0) {
      this.healthyProxies = [];
      return;
    }

    const verificationPromises = this.proxies.map(async (proxy) => {
      const isHealthy = await this.testProxy(proxy);
      return { proxy, isHealthy };
    });

    const results = await Promise.allSettled(verificationPromises);
    
    this.healthyProxies = results
      .filter(r => r.status === 'fulfilled' && r.value.isHealthy)
      .map(r => r.value.proxy);

    console.log(`[ProxyManager] Health checks completed. Healthy Pool: ${this.healthyProxies.length}/${this.proxies.length}`);
  }

  /**
   * Validates a single proxy gateway connection speed and YouTube visibility
   * @param {string} proxy - Proxy connection string
   * @returns {Promise<boolean>} True if proxy answers 200 within limits
   */
  testProxy(proxy) {
    return new Promise((resolve) => {
      // Execute command testing target YouTube headers
      const testCmd = `curl -x ${proxy} -s -o /dev/null -w "%{http_code}" https://www.youtube.com --max-time 5`;
      
      exec(testCmd, (error, stdout) => {
        if (error) {
          return resolve(false);
        }
        const status = stdout.trim();
        // 200 or 302/301 redirects are acceptable status headers
        resolve(status === '200' || status === '302' || status === '301');
      });
    });
  }

  /**
   * Rotates and supplies the active healthy list
   * @returns {Array<string>} Active rotated proxy pool list
   */
  getActiveProxies() {
    // Shuffle the list if past the rotation timer
    if (Date.now() - this.lastRotation > this.rotationInterval) {
      this.lastRotation = Date.now();
      this.healthyProxies = this.shuffleArray([...this.healthyProxies]);
    }
    return this.healthyProxies;
  }

  /**
   * Extracts one random healthy proxy from the pool
   * @returns {string|null} Rotated proxy URI or null
   */
  getRandomProxy() {
    const list = this.getActiveProxies();
    if (list.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * list.length);
    return list[randomIndex];
  }

  /**
   * Marks a proxy as failed. If failures exceed limits, isolates it from active pools
   * @param {string} proxy - Target proxy
   */
  markProxyFailed(proxy) {
    const failures = (this.failedProxies.get(proxy) || 0) + 1;
    this.failedProxies.set(proxy, failures);

    console.warn(`[ProxyManager] Proxy fail recorded (${failures}/${this.maxFailures}): ${proxy}`);

    if (failures >= this.maxFailures) {
      this.healthyProxies = this.healthyProxies.filter(p => p !== proxy);
      this.failedProxies.delete(proxy);
      console.error(`[ProxyManager] Evicted toxic proxy from healthy pool: ${proxy}`);
    }
  }

  /**
   * Simple array shuffling utility (Fisher-Yates)
   */
  shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }
}

module.exports = new ProxyManager();
