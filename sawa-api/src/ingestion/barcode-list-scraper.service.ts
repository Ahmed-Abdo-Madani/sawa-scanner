import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, BrowserContext, Page } from 'playwright';
import * as path from 'path';
import * as fs from 'fs/promises';

import { Product } from '../entities/product.entity';
import { ProductAlternativeName } from '../entities/product-alternative-name.entity';
import { BarcodeListNamesJobDto } from './dto/barcode-list-names-job.dto';
import { RobotsTxtService } from './scraper/robots-txt.service';
import { getRandomUA, applyJitter, withRetry } from './scraper/evasion';

interface ScrapedName {
  name: string;
  measure: string | null;
  popularity: number;
}

interface BarcodeListSummary {
  productsProcessed: number;
  productsWithNames: number;
  productsNoResults: number;
  productsErrored: number;
  totalNamesIngested: number;
  durationMs: number;
  startedAt: string;
  completedAt: string;
}

const BARCODE_LIST_BASE = 'https://barcode-list.com/barcode/EN/Search.htm';

@Injectable()
export class BarcodeListScraperService {
  private readonly logger = new Logger(BarcodeListScraperService.name);
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;

  constructor(
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductAlternativeName)
    private readonly altNameRepo: Repository<ProductAlternativeName>,
    private readonly robotsTxtService: RobotsTxtService,
    private readonly configService: ConfigService,
  ) {}

  private async launchBrowser() {
    const stealthPlugin = StealthPlugin();
    chromium.use(stealthPlugin);

    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    this.context = await this.browser.newContext({
      userAgent: getRandomUA('desktop'),
      viewport: { width: 1920, height: 1080 },
    });

    // Resource blocking for speed
    await this.context.route('**/*', (route) => {
      const type = route.request().resourceType();
      if (['image', 'stylesheet', 'font', 'media'].includes(type)) {
        return route.abort();
      }
      return route.continue();
    });
  }

  private async closeBrowser() {
    if (this.context) {
      await this.context.close().catch((err: any) => this.logger.warn(`Failed to close context: ${err.message}`));
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close().catch((err: any) => this.logger.warn(`Failed to close browser: ${err.message}`));
      this.browser = null;
    }
  }

  async run(opts: BarcodeListNamesJobDto = {}, job?: Job): Promise<BarcodeListSummary> {
    const startedAt = new Date();
    const dryRun = opts.dryRun ?? false;
    const maxProducts = opts.maxProducts ?? 0;
    const dailyBudget =
      opts.dailyBudget ??
      Number.parseInt(
        this.configService.get<string>('BARCODE_LIST_DAILY_BUDGET') || '5000',
        10,
      );
    const requestDelayMs = Number.parseInt(
      this.configService.get<string>('BARCODE_LIST_REQUEST_DELAY_MS') || '2000',
      10,
    );

    this.logger.log(
      `Starting Barcode-List name scraping (dryRun=${dryRun}, budget=${dailyBudget}, delay=${requestDelayMs}ms)`,
    );

    await this.launchBrowser();

    try {
      // Fetch products ordered by completeness score DESC.
      // Exclude products that already have alternative names from barcode-list.
      const qb = this.productRepo
        .createQueryBuilder('product')
        .leftJoin(
          'product_alternative_name',
          'pan',
          'pan.product_id = product.id AND pan.source = :source',
          { source: 'barcode-list' },
        )
        .where('pan.id IS NULL') // Only products without barcode-list names
        .andWhere('product.gtin IS NOT NULL') // Must have a GTIN to scrape
        .orderBy('product.data_completeness_score', 'DESC');

      if (maxProducts > 0) {
        qb.limit(maxProducts);
      }

      const products = await qb.getMany();
      const processLimit = Math.min(products.length, dailyBudget);
      this.logger.log(
        `Found ${products.length} products without barcode-list names. Will process up to ${processLimit}.`,
      );

      let productsProcessed = 0;
      let productsWithNames = 0;
      let productsNoResults = 0;
      let productsErrored = 0;
      let totalNamesIngested = 0;

      for (let i = 0; i < processLimit; i++) {
        const product = products[i];
        productsProcessed++;

        try {
          if (!product.gtin) continue;
          const names = await this.scrapeNamesForGtin(product.gtin, requestDelayMs);

          if (names.length === 0) {
            productsNoResults++;
            this.logger.debug(`[NO RESULTS] GTIN ${product.gtin}`);
          } else {
            productsWithNames++;

            if (!dryRun) {
              const saved = await this.saveAlternativeNames(product.id, names);
              totalNamesIngested += saved;
            } else {
              totalNamesIngested += names.length;
            }

            this.logger.log(
              `[FOUND] GTIN ${product.gtin} → ${names.length} names (top: "${names[0]?.name}")`,
            );
          }
        } catch (error: any) {
          productsErrored++;
          this.logger.warn(
            `[ERROR] GTIN ${product.gtin}: ${error.message}`,
          );
        }

        if (productsProcessed % 50 === 0) {
          if (job && job.token) {
            await job.extendLock(job.token, 300000).catch((err: any) => this.logger.warn(`Failed to extend lock: ${err.message}`));
          }
          this.logger.log(
            `Progress: ${productsProcessed}/${processLimit} | found=${productsWithNames} empty=${productsNoResults} errors=${productsErrored}`,
          );
        }
      }

      const summary = this.createSummary(
        productsProcessed,
        productsWithNames,
        productsNoResults,
        productsErrored,
        totalNamesIngested,
        startedAt,
      );

      if (!dryRun) {
        await this.writeSummaryReport(summary);
      }

      this.logger.log(
        `Barcode-List scraping complete. Processed=${productsProcessed}, Found=${productsWithNames}, Empty=${productsNoResults}, Errors=${productsErrored}, Names=${totalNamesIngested}`,
      );

      return summary;
    } finally {
      await this.closeBrowser();
    }
  }

  /**
   * Scrapes barcode-list.com for a single GTIN and returns parsed name entries.
   */
  private async scrapeNamesForGtin(
    gtin: string,
    requestDelayMs: number,
  ): Promise<ScrapedName[]> {
    const searchUrl = `${BARCODE_LIST_BASE}?barcode=${encodeURIComponent(gtin)}`;

    // Check robots.txt compliance
    const allowed = await this.robotsTxtService.isAllowed(searchUrl);
    if (!allowed) {
      this.logger.debug(`Robots.txt disallows: ${searchUrl}`);
      return [];
    }

    // Apply jitter delay before request
    await applyJitter(requestDelayMs, requestDelayMs + 1000);

    const html = await withRetry(async () => {
      if (!this.context) throw new Error('Browser context not initialized');
      const page = await this.context.newPage();
      try {
        await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
        
        // Wait briefly for any dynamic content to settle
        await page.waitForTimeout(2000);
        
        // Attempt to dismiss any cookie consent modals
        await this.dismissConsentModals(page);

        return await page.content();
      } finally {
        await page.close().catch(() => {});
      }
    }, 3);

    return this.parseNamesFromHtml(html);
  }

  private async dismissConsentModals(page: Page) {
    try {
      const acceptSelectors = [
        'button:has-text("Accept")',
        'button:has-text("I Accept")',
        'button:has-text("Agree")',
        '.cookie-accept',
        '#onetrust-accept-btn-handler'
      ];
      for (const selector of acceptSelectors) {
        const element = await page.$(selector);
        if (element) {
          const isVisible = await element.isVisible();
          if (isVisible) {
            await element.click();
            await page.waitForTimeout(500); // Wait for modal to disappear
            return;
          }
        }
      }
    } catch (err: any) {
      this.logger.debug(`Could not dismiss consent modal: ${err.message}`);
    }
  }

  /**
   * Parses the HTML table from barcode-list.com to extract product names.
   *
   * Expected table structure:
   * <table ...>
   *   <tr> (header with green background)
   *     <td>Nr</td><td>Barcode</td><td>Product Name</td><td>Measure</td><td>Rating*</td>
   *   </tr>
   *   <tr>
   *     <td>1</td><td>5449000000996</td><td>COCA COLA 330ML CAN</td><td>ITEM</td><td>54</td>
   *   </tr>
   *   ...
   * </table>
   */
  private parseNamesFromHtml(html: string): ScrapedName[] {
    const names: ScrapedName[] = [];

    // Find the results table — it contains "Product Name" header
    const tableMatch = html.match(
      /<table[^>]*>[\s\S]*?Product\s*Name[\s\S]*?<\/table>/i,
    );
    if (!tableMatch) {
      return names;
    }

    const tableHtml = tableMatch[0];

    // Extract all table rows
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch: RegExpExecArray | null;
    let isFirstRow = true;

    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      // Skip the header row
      if (isFirstRow) {
        isFirstRow = false;
        continue;
      }

      const rowHtml = rowMatch[1];
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const cells: string[] = [];
      let cellMatch: RegExpExecArray | null;

      while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
        // Strip HTML tags from cell content
        const cellText = cellMatch[1].replace(/<[^>]+>/g, '').trim();
        cells.push(cellText);
      }

      // Expected: [Nr, Barcode, Product Name, Measure, Rating]
      if (cells.length >= 3) {
        const productName = cells[2]?.trim();
        const measure = cells.length >= 4 ? cells[3]?.trim() || null : null;
        const popularity =
          cells.length >= 5 ? Number.parseInt(cells[4], 10) || 0 : 0;

        if (productName && productName.length > 0) {
          names.push({
            name: productName,
            measure,
            popularity,
          });
        }
      }
    }

    return names;
  }

  /**
   * Saves alternative names for a product, skipping duplicates via ON CONFLICT.
   * Returns the number of names actually inserted.
   */
  private async saveAlternativeNames(
    productId: string,
    names: ScrapedName[],
  ): Promise<number> {
    if (names.length === 0) return 0;

    const entities = names.map((n) => ({
      product_id: productId,
      name: n.name,
      measure: n.measure,
      popularity: n.popularity,
      source: 'barcode-list',
    }));

    try {
      const result = await this.altNameRepo
        .createQueryBuilder()
        .insert()
        .into(ProductAlternativeName)
        .values(entities)
        .orIgnore() // Skip duplicate (product_id, name) pairs
        .execute();

      return result.identifiers?.filter((id) => id.id).length ?? names.length;
    } catch (error: any) {
      this.logger.warn(
        `Failed to save names for product ${productId}: ${error.message}`,
      );
      return 0;
    }
  }

  private createSummary(
    productsProcessed: number,
    productsWithNames: number,
    productsNoResults: number,
    productsErrored: number,
    totalNamesIngested: number,
    startedAt: Date,
  ): BarcodeListSummary {
    const completedAt = new Date();
    return {
      productsProcessed,
      productsWithNames,
      productsNoResults,
      productsErrored,
      totalNamesIngested,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      durationMs: completedAt.getTime() - startedAt.getTime(),
    };
  }

  private async writeSummaryReport(summary: BarcodeListSummary) {
    const reportsDir = path.join(
      process.cwd(),
      'uploads',
      'barcode-list-reports',
    );
    await fs.mkdir(reportsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `summary-${timestamp}.json`;
    const filepath = path.join(reportsDir, filename);

    await fs.writeFile(filepath, JSON.stringify(summary, null, 2), 'utf-8');
    this.logger.log(`Summary report written to ${filepath}`);
  }
}
