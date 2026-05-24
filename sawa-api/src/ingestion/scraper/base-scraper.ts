import { chromium } from 'playwright-extra';
import {
  Browser,
  BrowserContext,
  Page,
  Response as PlaywrightResponse,
} from 'playwright';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Logger } from '@nestjs/common';
import { getRandomUA, applyJitter, withRetry } from './evasion';
import { RobotsTxtService } from './robots-txt.service';
import { ScrapedProductData } from '../dto/ingestion-job.dto';

// Use stealth plugin
chromium.use(StealthPlugin());

export abstract class BaseScraper {
  protected readonly logger = new Logger(this.constructor.name);
  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;
  protected launchPromise: Promise<void> | null = null;

  protected static lastAccessedHost: string | null = null;
  protected static lastAccessTime: number = 0;

  protected pagePool: Page[] = [];
  protected static hostLatencies: Record<string, number[]> = {};

  protected static recordHostLatency(host: string, durationMs: number): void {
    if (!BaseScraper.hostLatencies[host]) {
      BaseScraper.hostLatencies[host] = [];
    }
    BaseScraper.hostLatencies[host].push(durationMs);
    if (BaseScraper.hostLatencies[host].length > 5) {
      BaseScraper.hostLatencies[host].shift();
    }
  }

  protected getAdaptiveSelectorTimeout(urlOrHost: string): number {
    try {
      let host = urlOrHost;
      if (urlOrHost.startsWith('http://') || urlOrHost.startsWith('https://')) {
        host = new URL(urlOrHost).host;
      }
      
      const envTimeout = process.env.SCRAPER_SELECTOR_TIMEOUT ? parseInt(process.env.SCRAPER_SELECTOR_TIMEOUT, 10) : null;
      const maxTimeout = envTimeout || 6000; // default max: 6s (relaxed from 3s)
      const minTimeout = envTimeout ? Math.round(envTimeout / 2.5) : 3000; // default min: 3s (relaxed from 1.2s)

      const latencies = BaseScraper.hostLatencies[host];
      if (!latencies || latencies.length < 2) {
        return maxTimeout;
      }
      const avg = latencies.reduce((sum, val) => sum + val, 0) / latencies.length;
      const adaptive = Math.max(minTimeout, Math.min(maxTimeout, Math.round(avg * 2.0)));
      this.logger.debug(`[Adaptive Timeout] Host: ${host}, Avg Latency: ${Math.round(avg)}ms -> Selector Timeout: ${adaptive}ms`);
      return adaptive;
    } catch {
      return 6000;
    }
  }

  protected async acquirePage(): Promise<Page> {
    if (!this.context) {
      throw new Error('Browser context is not launched');
    }
    while (this.pagePool.length > 0) {
      const page = this.pagePool.pop()!;
      try {
        await page.evaluate(() => 1);
        this.logger.debug('Reused pre-warmed page from pool');
        return page;
      } catch (err) {
        this.logger.debug('Pooled page was closed or dead, discarding...');
        await page.close().catch(() => {});
      }
    }
    this.logger.debug('Creating new page (pool was empty)');
    return await this.context.newPage();
  }

  protected async releasePage(page: Page): Promise<void> {
    try {
      if (this.pagePool.length < 3) {
        await page.goto('about:blank', { timeout: 5000 }).catch(() => {});
        this.pagePool.push(page);
        this.logger.debug(`Released page back to pool (pool size: ${this.pagePool.length})`);
      } else {
        await page.close().catch(() => {});
      }
    } catch (err) {
      await page.close().catch(() => {});
    }
  }

  constructor(
    protected readonly robotsTxtService: RobotsTxtService,
    protected readonly config: {
      headless: boolean;
      cookieSessionPath?: string;
      deviceProfile?: 'mobile' | 'desktop';
      channel?: string;
    },
  ) {}

  protected async applyHostThrottling(targetUrl: string): Promise<void> {
    // Throttling disabled for live on-demand barcode scanning to ensure fast response times
    return Promise.resolve();
  }

  /** Returns true when the browser context is alive and usable. */
  isLaunched(): boolean {
    if (this.context === null) return false;
    try {
      // pages() is synchronous in Playwright. If context/browser is closed, it will throw.
      this.context.pages();
      return true;
    } catch (err: any) {
      this.logger.warn(
        `Sanity check failed: Browser context is closed or crashed (${err.message}). Resetting references.`,
      );
      this.context = null;
      this.browser = null;
      return false;
    }
  }

  /**
   * Launches the browser only if it is not already running.
   * Use this in processor jobs instead of raw launch() to enable browser reuse.
   * Synchronized to prevent concurrent launch race conditions.
   */
  async ensureLaunched(): Promise<void> {
    if (this.isLaunched()) return;
    if (this.launchPromise) {
      return this.launchPromise;
    }
    this.launchPromise = this.launch().finally(() => {
      this.launchPromise = null;
    });
    return this.launchPromise;
  }

  async launch(): Promise<void> {
    this.logger.log('Launching browser...');

    const launchOptions: any = {
      headless: this.config.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
      ],
    };

    if ((this.config as any).channel) {
      launchOptions.channel = (this.config as any).channel;
    }

    const isMobile = this.config.deviceProfile !== 'desktop';
    const viewport = isMobile
      ? { width: 390, height: 844 }
      : { width: 1280, height: 800 };
    const userAgent = getRandomUA(isMobile ? 'mobile' : 'desktop');

    try {
      if (this.config.cookieSessionPath) {
        const sessionPath = `${this.config.cookieSessionPath}-${process.pid}`;
        this.context = await chromium.launchPersistentContext(
          sessionPath,
          {
            ...launchOptions,
            userAgent,
            viewport,
            deviceScaleFactor: isMobile ? 3 : 1,
            isMobile,
            hasTouch: isMobile,
          },
        );
      } else {
        this.browser = await chromium.launch(launchOptions);
        this.context = await this.browser.newContext({
          userAgent,
          viewport,
          deviceScaleFactor: isMobile ? 3 : 1,
          isMobile,
          hasTouch: isMobile,
        });
      }

      if (this.context) {
        this.context.on('close', () => {
          this.logger.warn('Browser context closed. Resetting references.');
          this.context = null;
          this.browser = null;
        });
      }

      if (this.browser) {
        this.browser.on('disconnected', () => {
          this.logger.warn('Browser disconnected. Resetting references.');
          this.context = null;
          this.browser = null;
        });
      }
    } catch (err: any) {
      this.logger.error(`Failed to launch browser/context: ${err.message}`);
      this.context = null;
      this.browser = null;
      throw err;
    }

    // Block unnecessary resources to massively speed up page loads
    if (this.context && this.config.headless) {
      await this.context.route('**/*', (route) => {
        const type = route.request().resourceType();
        const url = route.request().url();
        
        // Salla/Etaam storefronts rely on CSS and image rendering for Cloudflare Turnstile validation.
        // Blocking stylesheets and images on these domains triggers immediate Turnstile challenge failures.
        const isSalla = url.includes('etaamexpress.com') || url.includes('salla');
        const blockedTypes = isSalla
          ? ['font', 'media']
          : ['font', 'media', 'stylesheet', 'image'];

        if (
          blockedTypes.includes(type) ||
          url.includes('google-analytics') ||
          url.includes('hotjar') ||
          url.includes('segment.com')
        ) {
          route.abort();
        } else {
          route.continue();
        }
      });
    }
  }

  protected async navigateWithEvasion(
    page: Page,
    url: string,
    waitUntil: 'load' | 'domcontentloaded' | 'networkidle' | 'commit' = 'load',
    timeout: number = 60000,
    jitterMin?: number,
    jitterMax?: number,
  ): Promise<PlaywrightResponse | null> {
    if (!url || url.trim() === '') {
      throw new Error(`Invalid navigation URL: "${url}"`);
    }

    const isAllowed = await this.robotsTxtService.isAllowed(url);
    if (!isAllowed) {
      throw new Error(`Navigation blocked by robots.txt: ${url}`);
    }

    await applyJitter(jitterMin, jitterMax);


    let navigationResponse: PlaywrightResponse | null = null;
    const startTime = Date.now();
    await withRetry(async () => {
      this.logger.debug(`Navigating to: ${url}`);
      const response = await page.goto(url, { waitUntil, timeout });
      navigationResponse = response;

      if (!response) {
        throw new Error('No response received during navigation');
      }

      const status = response.status();
      if (status === 429 || status >= 500) {
        const err = new Error(`Navigation failed with status: ${status}`);
        (err as any).status = status;
        throw err;
      }
    });

    const duration = Date.now() - startTime;
    try {
      const host = new URL(url).host;
      BaseScraper.recordHostLatency(host, duration);
    } catch { /* ignore */ }

    await this.dismissConsentModals(page);
    return navigationResponse;
  }

  protected async dismissConsentModals(page: Page): Promise<void> {
    const selectors = [
      '#onetrust-accept-btn-handler', // Carrefour, etc.
      'button[aria-label="Close"]', // Tamimi, etc.
      '#gdpr-cookie-accept',
      '.cookie-accept',
      '#cookiescript_accept',
      'button:has-text("Accept All")',
      'button:has-text("OK")',
      '.modal-close',
      '[aria-label="dismiss cookie message"]',
    ];

    for (const selector of selectors) {
      try {
        const element = await page.$(selector);
        if (element && (await element.isVisible())) {
          this.logger.debug(
            `Dismissing consent modal with selector: ${selector}`,
          );
          await element.click();
          await page.waitForTimeout(500); // Wait for animation
        }
      } catch (e) {
        // Ignore if error or not found
      }
    }

    // Special case for Panda (login modal that often blocks UI)
    if (page.url().includes('panda.sa')) {
      await page.keyboard.press('Escape');
    }
  }

  protected async downloadImageAsBase64(
    page: Page,
    url: string,
  ): Promise<string> {
    this.logger.debug(`Downloading image via browser context: ${url}`);
    return await page.evaluate(async (imgUrl) => {
      const resp = await fetch(imgUrl);
      if (!resp.ok) throw new Error(`Failed to fetch image: ${resp.status}`);
      const blob = await resp.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64data = reader.result as string;
          // Remove the data:image/xxx;base64, prefix
          resolve(base64data.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }, url);
  }

  async close(): Promise<void> {
    this.logger.log('Closing browser and cleaning up resources...');
    try {
      for (const page of this.pagePool) {
        await page.close().catch(() => {});
      }
      this.pagePool = [];
      if (this.context) {
        await this.context.close();
      }
      if (this.browser) {
        await this.browser.close();
      }
    } catch (err) {
      this.logger.warn(`Error during browser cleanup: ${err.message}`);
    } finally {
      this.context = null;
      this.browser = null;
    }
  }

  abstract scrapeListingPage(
    categoryUrl: string,
    page: number,
  ): Promise<ScrapedProductData[]>;
  abstract scrapeDetailPage(
    productUrl: string,
  ): Promise<ScrapedProductData & { page?: Page }>;
}
