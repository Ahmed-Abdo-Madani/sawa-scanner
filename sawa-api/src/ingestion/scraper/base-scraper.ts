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
    protected readonly config: { headless: boolean; cookieSessionPath?: string },
  ) {}

  async launch(): Promise<void> {
    this.logger.log('Launching browser...');
    
    const launchOptions = {
      headless: this.config.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    };

    if (this.config.cookieSessionPath) {
      this.context = await chromium.launchPersistentContext(
        this.config.cookieSessionPath,
        {
          ...launchOptions,
          userAgent: getRandomUA(),
        },
      );
    } else {
      this.browser = await chromium.launch(launchOptions);
      this.context = await this.browser.newContext({
        userAgent: getRandomUA(),
      });
    }
  }

  protected async navigateWithEvasion(page: Page, url: string): Promise<void> {
    const isAllowed = await this.robotsTxtService.isAllowed(url);
    if (!isAllowed) {
      throw new Error(`Navigation blocked by robots.txt: ${url}`);
    }

    await applyJitter();

    await withRetry(async () => {
      this.logger.debug(`Navigating to: ${url}`);
      const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
      
      if (!response) {
        throw new Error('No response received during navigation');
      }

      const status = response.status();
      if (status === 429 || status >= 500) {
        throw new Error(`Navigation failed with status: ${status}`);
      }
    });
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
  abstract scrapeDetailPage(productUrl: string): Promise<ScrapedProductData>;
}
