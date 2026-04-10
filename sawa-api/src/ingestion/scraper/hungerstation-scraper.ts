import { Page } from 'playwright';
import { BaseScraper } from './base-scraper';
import { ScrapedProductData } from '../dto/ingestion-job.dto';

export class HungerStationScraper extends BaseScraper {
  async scrapeListingPage(categoryUrl: string, pageNum: number): Promise<ScrapedProductData[]> {
    if (!this.context) throw new Error('Browser context not initialized');
    
    const page = await this.context.newPage();
    try {
      await this.navigateWithEvasion(page, categoryUrl);

      // HungerStation often uses infinite scroll.
      // If pageNum is high, we might need to scroll down multiple times.
      if (pageNum > 1) {
        this.logger.debug(`Scrolling down for infinite scroll (target: "page" ${pageNum})`);
        for (let i = 0; i < pageNum * 2; i++) {
          await page.evaluate(() => window.scrollBy(0, 800));
          await page.waitForTimeout(1000); // Wait for potential lazy loading
        }
      }

      const productCardSelector = '[data-testid="item-card"], .vendor-item';
      await page.waitForSelector(productCardSelector, { timeout: 15000 });

      const products = await page.evaluate((selector) => {
        const cards = Array.from(document.querySelectorAll(selector));
        return cards.map((card) => {
          const nameEl = card.querySelector('.item-name, [data-testid="item-name"]');
          const priceEl = card.querySelector('.item-price, [data-testid="item-price"]');
          const linkEl = card.querySelector('a') as HTMLAnchorElement;
          const imgEl = card.querySelector('img') as HTMLImageElement;

          return {
            name: nameEl?.textContent?.trim() || '',
            price: parseFloat(priceEl?.textContent?.replace(/[^0-9.]/g, '') || '0'),
            productPageUrl: linkEl?.href || '',
            imageUrls: imgEl?.src ? [imgEl.src] : [],
          };
        });
      }, productCardSelector);

      return products as ScrapedProductData[];
    } finally {
      await page.close();
    }
  }

  async scrapeDetailPage(productUrl: string): Promise<ScrapedProductData> {
    if (!this.context) throw new Error('Browser context not initialized');
    
    const page = await this.context.newPage();
    try {
      await this.navigateWithEvasion(page, productUrl);

      await page.waitForSelector('.item-details-container, [data-testid="item-detail"]', { timeout: 15000 });

      const detail = await page.evaluate(() => {
        const nameEl = document.querySelector('h1.item-name, [data-testid="item-header-name"]');
        const priceEl = document.querySelector('.item-price, [data-testid="item-header-price"]');
        const weightEl = document.querySelector('.item-volume, .item-weight');
        const descEl = document.querySelector('.item-description');
        
        const imgElements = Array.from(document.querySelectorAll('.item-image img, [data-testid="item-image"]'));
        const images = imgElements.map((img: any) => img.src).filter((src) => !!src);

        return {
          name: nameEl?.textContent?.trim() || '',
          price: parseFloat(priceEl?.textContent?.replace(/[^0-9.]/g, '') || '0'),
          weight: weightEl?.textContent?.trim() || '',
          description: descEl?.textContent?.trim() || '',
          imageUrls: [...new Set(images)],
          productPageUrl: window.location.href,
        };
      });

      return detail as ScrapedProductData;
    } finally {
      await page.close();
    }
  }
}
