import { Page } from 'playwright';
import { BaseScraper } from './base-scraper';
import { ScrapedProductData } from '../dto/ingestion-job.dto';

export class TamimiPriceScraper extends BaseScraper {
  async scrapeListingPage(categoryUrl: string, pageNum: number): Promise<ScrapedProductData[]> {
    if (!this.context) throw new Error('Browser context not initialized');

    const page = await this.context.newPage();
    try {
      // Tamimi pagination: ?page=1
      const url = new URL(categoryUrl);
      url.searchParams.set('page', pageNum.toString());
      
      await this.navigateWithEvasion(page, url.toString(), 'load');

      const productCardSelector = 'a[class*="Product__StyledA"]';
      await page.waitForSelector(productCardSelector, { timeout: 30000 });

      const products = await page.evaluate((selector) => {
        const cards = Array.from(document.querySelectorAll(selector));
        return cards.map((card) => {
          const nameEl = card.querySelector('span'); // Typically matches name in standard Tamimi cards
          const priceEl = card.querySelector('span[class*="Product__Price"]');
          const imgEl = card.querySelector('img') as HTMLImageElement;

          const name = nameEl?.textContent?.trim() || '';
          const price = parseFloat(priceEl?.textContent?.replace(/[^0-9.]/g, '') || '0');
          const productPageUrl = (card as HTMLAnchorElement).href || '';

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

      await page.waitForSelector('h1, [class*="ProductDetail__Name"]', { timeout: 30000 });

      const detail = await page.evaluate(() => {
        const nameEl = document.querySelector('h1, [class*="ProductDetail__Name"]');
        const priceEl = document.querySelector('span[class*="ProductDetail__Price"]');
        const brandEl = document.querySelector('[class*="ProductDetail__Brand"]');
        const descEl = document.querySelector('[class*="ProductDetail__Description"]');
        const weightEl = document.querySelector('[class*="ProductDetail__Weight"]');
        
        const imgElements = Array.from(document.querySelectorAll('[class*="ProductDetail__Image"] img'));
        const images = imgElements.map((img: any) => img.src).filter((src) => !!src);

        const sEl = document.querySelector('.stock.available, .in-stock, [class*="InStock"]');
        const inStock = !!sEl || !document.body.innerText.toLowerCase().includes('out of stock');

        // Identify GTIN from Next.js hydration state
        let gtin = '';
        try {
          if ((window as any).__NEXT_DATA__) {
             const props = (window as any).__NEXT_DATA__.props;
             gtin = props.pageProps?.product?.gtin || props.pageProps?.product?.sku || '';
          }
        } catch (e) { /* ignore */ }

        return {
          name: nameEl?.textContent?.trim() || '',
          price: parseFloat(priceEl?.textContent?.replace(/[^0-9.]/g, '') || '0'),
          brand: brandEl?.textContent?.trim() || '',
          weight: weightEl?.textContent?.trim() || '',
          description: descEl?.textContent?.trim() || '',
          imageUrls: [...new Set(images)],
          productPageUrl: window.location.href,
          inStock: inStock,
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
