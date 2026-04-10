import { Page } from 'playwright';
import { BaseScraper } from './base-scraper';
import { ScrapedProductData } from '../dto/ingestion-job.dto';

export class CarrefourPriceScraper extends BaseScraper {
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

      const priceSelector = '.carrefour-product-price, .price__amount';
      await page.waitForSelector(priceSelector, { timeout: 15000 });

      const data = await page.evaluate(() => {
        const pEl = document.querySelector('.carrefour-product-price, .price__amount');
        const priceText = pEl?.textContent || '0';
        const outOfStock = document.body.innerText.toLowerCase().includes('out of stock') || 
                           document.body.innerText.toLowerCase().includes('غير متوفر');
        
        return {
          price: parseFloat(priceText.replace(/[^0-9.]/g, '') || '0'),
          inStock: !outOfStock,
        };
      });

      return data;
    } finally {
      await page.close();
    }
  }
}
