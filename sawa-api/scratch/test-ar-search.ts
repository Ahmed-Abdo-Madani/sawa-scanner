import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EtaamGtinArScraper } from '../src/ingestion/scraper/etaam-gtin-ar-scraper';
import { RobotsTxtService } from '../src/ingestion/scraper/robots-txt.service';

async function bootstrap() {
  console.log('🧪 Bootstrapping test module with headless: false ...');
  const moduleFixture: TestingModule = await Test.createTestingModule({
    providers: [
      EtaamGtinArScraper,
      {
        provide: RobotsTxtService,
        useValue: { isAllowed: async () => true },
      },
      {
        provide: ConfigService,
        useValue: {
          get: (key: string) => {
            if (key === 'scraper') return { headless: false, executablePath: undefined, timeout: 30000 };
            return null;
          },
        },
      },
    ],
  }).compile();

  const scraper = moduleFixture.get<EtaamGtinArScraper>(EtaamGtinArScraper);

  // Override launch to use headless: false
  scraper.launch = async function() {
    console.log('[DEBUG] Custom launch with persistent context, Chrome channel, and headless: true...');
    const launchOptions = {
      headless: true,
      channel: 'chrome',
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled'
      ],
    };

    const chromium = require('playwright-extra').chromium;
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    try {
      chromium.use(StealthPlugin());
    } catch (e) {}

    const isMobile = false;
    const viewport = { width: 1280, height: 800 };
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

    const sessionPath = './scraper-sessions/etaam-ar';
    const fs = require('fs');
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
    }

    this.context = await chromium.launchPersistentContext(sessionPath, {
      ...launchOptions,
      userAgent,
      viewport,
      deviceScaleFactor: 1,
      isMobile,
      hasTouch: false,
    });
  };

  scraper.searchAndGetBestMatch = async function(productNameAr: string, threshold = 0.5) {
    if (!this.context) throw new Error('Browser context not initialized');
      const page = await this.context.newPage();
      try {
      // Log all network requests and responses
      page.on('request', request => {
        const url = request.url();
        if (url.includes('api') || url.includes('search') || url.includes('products')) {
          console.log(`[REQ] ${request.method()} ${url}`);
        }
      });
      page.on('response', response => {
        const url = response.url();
        if (url.includes('api') || url.includes('search') || url.includes('products')) {
          console.log(`[RESP] ${response.status()} ${url}`);
        }
      });
      page.on('requestfailed', request => {
        const url = request.url();
        console.log(`[FAILED] ${request.failure()?.errorText || 'Unknown Error'} for ${url}`);
      });

      const searchUrl = new URL('https://etaamexpress.com/ar/search');
      searchUrl.searchParams.set('q', productNameAr);
      console.log(`[DEBUG] Navigating to: ${searchUrl.toString()}`);
      
      await this.navigateWithEvasion(page, searchUrl.toString(), 'load', 60000, 400, 1200);
      await page.waitForTimeout(12000); // give it plenty of time to solve Turnstile
      
      const title = await page.title();
      const bodyText = await page.evaluate(() => document.body.innerText);
      const first500 = bodyText.substring(0, 500).replace(/\n/g, ' ');
      console.log(`[DEBUG] Page Title: "${title}"`);
      console.log(`[DEBUG] First 500 chars of body: "${first500}"`);

      const ldScripts = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
          .map(s => s.textContent || '');
      });
      console.log(`[DEBUG] ld+json scripts found:`, ldScripts.length);
      for (const script of ldScripts) {
        console.log(`[DEBUG] JSON-LD Script content:`);
        console.log(script);
      }
      return null;
    } finally {
      await page.close().catch(() => {});
    }
  };

  try {
    await scraper.launch();
    console.log('\n🚀 Starting search for "أرز" ...\n');
    await scraper.searchAndGetBestMatch('أرز', 0.5);
  } catch (err) {
    console.error('❌ Error during execution:', err);
  } finally {
    await scraper.close();
    console.log('👋 Done.');
  }
}

bootstrap();
