import { Page } from 'playwright';
import { BaseScraper } from './base-scraper';
import { ScrapedProductData } from '../dto/ingestion-job.dto';

export class OthaimPriceScraper extends BaseScraper {
  async scrapeListingPage(categoryUrl: string, pageNum: number): Promise<ScrapedProductData[]> {
    if (!this.context) throw new Error('Browser context not initialized');

    const page = await this.context.newPage();
    try {
      // Noon pagination: ?page=1
      const url = new URL(categoryUrl);
      url.searchParams.set('page', pageNum.toString());
      
      await this.navigateWithEvasion(page, url.toString(), 'load');

      const productCardSelector = 'a[class*="productBoxLink"], div[data-qa="product-grid-item"]';
      await page.waitForSelector(productCardSelector, { timeout: 30000 });

      const products = await page.evaluate((selector) => {
        const cards = Array.from(document.querySelectorAll(selector));
        return cards.map((card) => {
          const nameEl = card.querySelector('div[data-qa="product-name"], [class*="productTitle"]');
          const priceEl = card.querySelector('.amount, [class*="price"]');
          const imgEl = card.querySelector('img') as HTMLImageElement;
          const linkEl = (card.tagName.toLowerCase() === 'a' ? card : card.querySelector('a')) as HTMLAnchorElement | null;

          const name = nameEl?.textContent?.trim() || '';
          const priceStr = priceEl?.textContent?.replace(/[^0-9.]/g, '') || '0';
          const price = parseFloat(priceStr);
          const productPageUrl = linkEl?.href || '';

          // Validation: Fail fast on incomplete data
          if (!name || price <= 0 || !productPageUrl) return null;

          return {
            name,
            price,
            productPageUrl,
            imageUrls: imgEl?.src ? [imgEl.src] : [],
          };
        }).filter(p => p !== null);
      }, productCardSelector);

      return products as ScrapedProductData[];
    } finally {
      await page.close();
    }
  }

  async scrapeDetailPage(productUrl: string): Promise<ScrapedProductData & { page?: Page }> {
    if (!this.context) throw new Error('Browser context not initialized');

    const page = await this.context.newPage();
    try {
      await this.navigateWithEvasion(page, productUrl, 'load');

      await page.waitForSelector('h1[data-qa="product-name"], .productName', { timeout: 30000 });

      const detail = await page.evaluate(() => {
        const nameEl = document.querySelector('h1[data-qa="product-name"], .productName');
        const priceEl = document.querySelector('.priceNow, .amount');
        const brandEl = document.querySelector('.brand, [data-qa="product-brand"]');
        const descEl = document.querySelector('.description, [data-qa="product-description"]');
        
        const imgElements = Array.from(document.querySelectorAll('.imageContainer img, [data-qa="product-image"]'));
        const images = imgElements.map((img: any) => img.src).filter((src) => !!src);

        const outOfStock = document.body.innerText.toLowerCase().includes('out of stock') || 
                           document.body.innerText.toLowerCase().includes('غير متوفر') ||
                           document.body.innerText.toLowerCase().includes('نفذت الكمية');

        // Identify GTIN from JSON-LD
        let gtin = '';
        try {
          const ldScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
          for (const script of ldScripts) {
            const json = JSON.parse(script.textContent || '{}');
            const product = Array.isArray(json) ? json.find(i => i['@type'] === 'Product') : json;
            if (product && (product.gtin13 || product.sku || product.gtin12)) {
              gtin = product.gtin13 || product.sku || product.gtin12;
              break;
            }
          }
        } catch (e) { /* ignore */ }

        return {
          name: nameEl?.textContent?.trim() || '',
          price: parseFloat(priceEl?.textContent?.replace(/[^0-9.]/g, '') || '0'),
          brand: brandEl?.textContent?.trim() || '',
          description: descEl?.textContent?.trim() || '',
          imageUrls: [...new Set(images)],
          productPageUrl: window.location.href,
          inStock: !outOfStock,
          gtin,
        };
      });

      return { ...(detail as any), page };
    } catch (err) {
      await page.close();
      throw err;
    }
  }

  async scrapeProductPrice(productUrl: string): Promise<{ price: number; inStock: boolean }> {
    const detail = await this.scrapeDetailPage(productUrl);
    try {
      return {
        price: detail.price,
        inStock: detail.inStock ?? true,
      };
    } finally {
      if (detail.page) {
        await detail.page.close().catch(err => this.logger.warn(`Failed to close page: ${err.message}`));
      }
    }
  }
}
