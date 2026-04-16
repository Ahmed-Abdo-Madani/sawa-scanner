import { chromium } from 'playwright-extra';
import { Browser, BrowserContext, Page } from 'playwright';
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

  constructor(
    protected readonly robotsTxtService: RobotsTxtService,
    protected readonly config: { headless: boolean; cookieSessionPath?: string; deviceProfile?: 'mobile' | 'desktop' },
  ) {}

  async launch(): Promise<void> {
    this.logger.log('Launching browser...');
    
    const launchOptions = {
      headless: this.config.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    };

    const isMobile = this.config.deviceProfile !== 'desktop';
    const viewport = isMobile ? { width: 390, height: 844 } : { width: 1280, height: 800 };
    const userAgent = isMobile 
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    if (this.config.cookieSessionPath) {
      this.context = await chromium.launchPersistentContext(
        this.config.cookieSessionPath,
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
  }

  protected async navigateWithEvasion(
    page: Page, 
    url: string, 
    waitUntil: 'load' | 'domcontentloaded' | 'networkidle' | 'commit' = 'load',
    timeout: number = 60000
  ): Promise<void> {
    if (!url || url.trim() === '') {
      throw new Error(`Invalid navigation URL: "${url}"`);
    }

    const isAllowed = await this.robotsTxtService.isAllowed(url);
    if (!isAllowed) {
      throw new Error(`Navigation blocked by robots.txt: ${url}`);
    }

    await applyJitter();

    await withRetry(async () => {
      this.logger.debug(`Navigating to: ${url}`);
      const response = await page.goto(url, { waitUntil, timeout });
      
      if (!response) {
        throw new Error('No response received during navigation');
      }

      const status = response.status();
      if (status === 429 || status >= 500) {
        throw new Error(`Navigation failed with status: ${status}`);
      }
    });

    await this.dismissConsentModals(page);
  }

  protected async dismissConsentModals(page: Page): Promise<void> {
    const selectors = [
      '#onetrust-accept-btn-handler', // Carrefour, etc.
      'button[aria-label="Close"]',      // Tamimi, etc.
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
        if (element && await element.isVisible()) {
          this.logger.debug(`Dismissing consent modal with selector: ${selector}`);
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

  protected async downloadImageAsBase64(page: Page, url: string): Promise<string> {
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
    }, url) as string;
  }

  async close(): Promise<void> {
    this.logger.log('Closing browser and cleaning up resources...');
    try {
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

  abstract scrapeListingPage(categoryUrl: string, page: number): Promise<ScrapedProductData[]>;
  abstract scrapeDetailPage(productUrl: string): Promise<ScrapedProductData & { page?: Page }>;
}
