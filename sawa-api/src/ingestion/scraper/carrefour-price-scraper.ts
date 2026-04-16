import { Page } from 'playwright';
import { BaseScraper } from './base-scraper';
import { ScrapedProductData } from '../dto/ingestion-job.dto';

export class CarrefourPriceScraper extends BaseScraper {
  async scrapeListingPage(categoryUrl: string, pageNum: number): Promise<ScrapedProductData[]> {
    if (!this.context) throw new Error('Browser context not initialized');

    const page = await this.context.newPage();
    try {
      const url = new URL(categoryUrl);
      url.searchParams.set('currentPage', (pageNum - 1).toString());
      url.searchParams.set('pageSize', '60');
      
      await this.navigateWithEvasion(page, url.toString(), 'load');

      const productCardSelector = '[data-testid="product-card"]';
      await page.waitForSelector(productCardSelector, { timeout: 30000 });

      const products = await page.evaluate((selector) => {
        const cards = Array.from(document.querySelectorAll(selector));
        return cards.map((card) => {
          const linkEl = card.querySelector('a[href*="/p/"]') as HTMLAnchorElement;
          const nameEl = card.querySelector('[data-testid="product_name"]') || linkEl?.querySelector('span');
          const priceEl = card.querySelector('[data-testid="product-price"], .price');
          const imgEl = card.querySelector('img') as HTMLImageElement;

          const name = nameEl?.textContent?.trim() || '';
          const price = parseFloat(priceEl?.textContent?.replace(/[^0-9.]/g, '') || '0');
          const productPageUrl = linkEl?.href || '';

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

      await page.waitForSelector('h1, [data-testid="product_name"]', { timeout: 30000 });

      const detail = await page.evaluate(() => {
        const nameEl = document.querySelector('h1, [data-testid="product_name"]');
        const priceEl = document.querySelector('[data-testid="product-price"], .price');
        const brandEl = document.querySelector('a.leading-5 span, .brand'); 
        const descEl = document.querySelector('.text-sm.leading-6, #description'); 
        
        const imgElements = Array.from(document.querySelectorAll('img[data-testid="product_image"], .gallery img'));
        const images = imgElements.map((img: any) => img.src).filter((src) => !!src);

        const outOfStock = document.body.innerText.toLowerCase().includes('out of stock') || 
                           document.body.innerText.toLowerCase().includes('غير متوفر');

        let gtin = '';
        try {
          const ldScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
          for (const script of ldScripts) {
            const json = JSON.parse(script.textContent || '{}');
            const products = Array.isArray(json) ? json : [json];
            const product = products.find(i => i['@type'] === 'Product');
            if (product && (product.gtin13 || product.sku || product.gtin12 || product.isbn)) {
              gtin = product.gtin13 || product.sku || product.gtin12 || product.isbn;
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
