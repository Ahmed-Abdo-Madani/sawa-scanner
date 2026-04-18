import { Page } from 'playwright';
import { BaseScraper } from './base-scraper';
import { ScrapedProductData } from '../dto/ingestion-job.dto';

export class PandaPriceScraper extends BaseScraper {
  async scrapeListingPage(
    categoryUrl: string,
    pageNum: number,
  ): Promise<ScrapedProductData[]> {
    if (!this.context) throw new Error('Browser context not initialized');

    const page = await this.context.newPage();
    try {
      const url = new URL(categoryUrl);
      url.searchParams.set('page', pageNum.toString());

      await this.navigateWithEvasion(page, url.toString(), 'load');

      // Verified selector from browser discovery
      const productCardSelector =
        'div.relative.flex.flex-col.h-full, .product-item';
      await page.waitForSelector(productCardSelector, { timeout: 30000 });

      const products = await page.evaluate((selector) => {
        const cards = Array.from(document.querySelectorAll(selector));
        return cards
          .map((card) => {
            const nameEl = card.querySelector(
              'span.text-black-700.text-sm.font-bold, span[class*="productName"], .name',
            );
            const priceEl = card.querySelector(
              'span.text-primary.text-lg.font-bold, .price, [class*="price"]',
            );
            const imgEl = card.querySelector('img') as HTMLImageElement;
            const linkEl = card.querySelector('a') as HTMLAnchorElement;

            const name = nameEl?.textContent?.trim() || '';
            const price = parseFloat(
              priceEl?.textContent?.replace(/[^0-9.]/g, '') || '0',
            );
            const productPageUrl = linkEl?.href || '';

            if (!name || price <= 0 || !productPageUrl) return null;

            return {
              name,
              price,
              productPageUrl,
              imageUrls: imgEl?.src ? [imgEl.src] : [],
            };
          })
          .filter((p) => p !== null);
      }, productCardSelector);

      return products as ScrapedProductData[];
    } finally {
      await page.close();
    }
  }

  async scrapeDetailPage(
    productUrl: string,
  ): Promise<ScrapedProductData & { page?: Page }> {
    if (!this.context) throw new Error('Browser context not initialized');

    const page = await this.context.newPage();
    try {
      await this.navigateWithEvasion(page, productUrl, 'load');

      await page.waitForSelector('h1, [class*="productTitle"]', {
        timeout: 30000,
      });

      const detail = await page.evaluate(() => {
        const nameEl = document.querySelector('h1, [class*="productTitle"]');
        const priceEl = document.querySelector(
          '.price, [class*="productPrice"], span.text-primary',
        );
        const brandEl = document.querySelector('.brand, [class*="brandName"]');
        const weightEl = document.querySelector(
          '.weight, [class*="productWeight"]',
        );

        const imgElements = Array.from(
          document.querySelectorAll('img[class*="productImage"], .gallery img'),
        );
        const images = imgElements
          .map((img: any) => img.src)
          .filter((src) => !!src);

        const outOfStock =
          document.body.innerText.toLowerCase().includes('out of stock') ||
          document.body.innerText.toLowerCase().includes('غير متوفر');

        let gtin = '';
        try {
          const ldScripts = Array.from(
            document.querySelectorAll('script[type="application/ld+json"]'),
          );
          for (const script of ldScripts) {
            const json = JSON.parse(script.textContent || '{}');
            const product = Array.isArray(json)
              ? json.find((i) => i['@type'] === 'Product')
              : json;
            if (product && (product.gtin13 || product.sku || product.gtin12)) {
              gtin = product.gtin13 || product.sku || product.gtin12;
              break;
            }
          }
          if (!gtin && (window as any).__NEXT_DATA__) {
            const props = (window as any).__NEXT_DATA__.props;
            gtin =
              props.pageProps?.product?.gtin ||
              props.pageProps?.product?.sku ||
              '';
          }
        } catch (e) {
          /* ignore */
        }

        return {
          name: nameEl?.textContent?.trim() || '',
          price: parseFloat(
            priceEl?.textContent?.replace(/[^0-9.]/g, '') || '0',
          ),
          brand: brandEl?.textContent?.trim() || '',
          weight: weightEl?.textContent?.trim() || '',
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

  async scrapeProductPrice(
    productUrl: string,
  ): Promise<{ price: number; inStock: boolean }> {
    const detail = await this.scrapeDetailPage(productUrl);
    try {
      return {
        price: detail.price,
        inStock: detail.inStock ?? true,
      };
    } finally {
      if (detail.page) {
        await detail.page
          .close()
          .catch((err) =>
            this.logger.warn(`Failed to close page: ${err.message}`),
          );
      }
    }
  }
}
