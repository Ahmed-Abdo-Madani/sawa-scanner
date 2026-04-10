import { Page } from 'playwright';
import { BaseScraper } from './base-scraper';
import { ScrapedProductData } from '../dto/ingestion-job.dto';

export class TamimiPriceScraper extends BaseScraper {
  async scrapeListingPage(categoryUrl: string, pageNum: number): Promise<ScrapedProductData[]> {
    return [];
  }

  async scrapeDetailPage(productUrl: string): Promise<ScrapedProductData> {
    const result = await this.scrapeProductPrice(productUrl);
    return {
      name: '',
      price: result.price,
      productPageUrl: productUrl,
      imageUrls: [],
    };
  }

  async scrapeProductPrice(productUrl: string): Promise<{ price: number; inStock: boolean }> {
    if (!this.context) throw new Error('Browser context not initialized');
    
    const page = await this.context.newPage();
    try {
      await this.navigateWithEvasion(page, productUrl);

      const priceSelector = '.product-price, .price-wrapper';
      await page.waitForSelector(priceSelector, { timeout: 15000 });

      const data = await page.evaluate(() => {
        const pEl = document.querySelector('.product-price, .price-wrapper');
        const priceText = pEl?.textContent || '0';
        const sEl = document.querySelector('.stock.available, .in-stock');
        
        return {
          price: parseFloat(priceText.replace(/[^0-9.]/g, '') || '0'),
          inStock: !!sEl || !document.body.innerText.toLowerCase().includes('out of stock'),
        };
      });

      return data;
    } finally {
      await page.close();
    }
  }
}
