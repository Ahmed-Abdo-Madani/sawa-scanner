import { Page } from 'playwright';
import { BaseScraper } from './base-scraper';
import { ScrapedProductData } from '../dto/ingestion-job.dto';

export class NinjaScraper extends BaseScraper {
  async scrapeListingPage(categoryUrl: string, pageNum: number): Promise<ScrapedProductData[]> {
    if (!this.context) throw new Error('Browser context not initialized');
    
    const page = await this.context.newPage();
    try {
      // Append page parameter if needed. Ninja might use ?page= or similar.
      const url = pageNum > 1 ? `${categoryUrl}?page=${pageNum}` : categoryUrl;
      await this.navigateWithEvasion(page, url);

      // Wait for product cards to appear
      // Selectors based on common e-commerce patterns or Ninja-specific guesses
      const productCardSelector = '.product-card, [data-testid="product-card"]';
      await page.waitForSelector(productCardSelector, { timeout: 15000 });

      const products = await page.evaluate((selector) => {
        const cards = Array.from(document.querySelectorAll(selector));
        return cards.map((card) => {
          const nameEl = card.querySelector('.product-title, [data-testid="product-title"]');
          const priceEl = card.querySelector('.product-price, [data-testid="product-price"]');
          const linkEl = card.querySelector('a') as HTMLAnchorElement;
          const imgEl = card.querySelector('img') as HTMLImageElement;

          return {
            name: nameEl?.textContent?.trim() || 'Unknown Product',
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

      // Wait for detail container
      await page.waitForSelector('.product-details, [data-testid="product-detail-container"]', { timeout: 15000 });

      const detail = await page.evaluate(() => {
        const nameEl = document.querySelector('h1, .product-name');
        const priceEl = document.querySelector('.current-price, .price');
        const weightEl = document.querySelector('.product-weight, .size-info');
        const descEl = document.querySelector('.product-description, #description');
        const brandEl = document.querySelector('.brand-name, [data-testid="brand-link"]');
        
        // Extract all Gallery images
        const imgElements = Array.from(document.querySelectorAll('.product-gallery img, [data-testid="product-image"]'));
        const images = imgElements.map((img: any) => img.src).filter((src) => !!src);

        return {
          name: nameEl?.textContent?.trim() || '',
          price: parseFloat(priceEl?.textContent?.replace(/[^0-9.]/g, '') || '0'),
          weight: weightEl?.textContent?.trim() || '',
          description: descEl?.textContent?.trim() || '',
          brand: brandEl?.textContent?.trim() || '',
          imageUrls: [...new Set(images)], // Unique images
          productPageUrl: window.location.href,
        };
      });

      return detail as ScrapedProductData;
    } finally {
      await page.close();
    }
  }
}
