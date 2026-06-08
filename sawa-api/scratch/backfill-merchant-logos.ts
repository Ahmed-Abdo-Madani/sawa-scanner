import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { AppDataSource } from '../src/data-source';
import { Merchant } from '../src/entities/merchant.entity';
import { normalizeHsMerchantName } from '../src/ingestion/scraper/hydration-utils';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

chromium.use(StealthPlugin());

// Load .env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

async function main() {
  await AppDataSource.initialize();
  console.log('Database connected.');

  const merchantRepo = AppDataSource.getRepository(Merchant);
  const merchants = await merchantRepo.find();
  console.log(`Loaded ${merchants.length} merchants from DB.`);

  console.log('Launching browser to crawl HungerStation stores...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  const districtUrl = 'https://hungerstation.com/sa-en/qc/supermarkets/riyadh/narjis';
  console.log(`Navigating to ${districtUrl}...`);
  await page.goto(districtUrl, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(3000);

  // Extract from DOM
  const crawledStores = await page.evaluate(() => {
    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('a[href*="/qc/"]'),
    );
    return links.map((a) => {
      const href = a.getAttribute('href') ?? '';
      const nameEl = a.querySelector(
        '[data-testid*="vendor-name"], h2, h3, [class*="name"]',
      );
      const arEl = a.querySelector('[lang="ar"]');
      const nameAr = arEl?.textContent?.trim() ?? '';
      const rawName =
        nameEl?.textContent?.trim() ?? a.textContent?.trim() ?? '';

      // Extract logo URL
      const img = a.querySelector('img');
      let logoUrl = '';
      if (img) {
        const src = img.getAttribute('src') ?? '';
        const srcset = img.getAttribute('srcset') ?? '';
        let rawSrc = src;
        if (!rawSrc && srcset) {
          const first = srcset.split(',')[0].trim().split(' ')[0];
          rawSrc = first;
        }
        if (rawSrc.includes('url=')) {
          try {
            const u = new URL(rawSrc, window.location.origin);
            logoUrl = u.searchParams.get('url') ?? '';
          } catch (e) {}
        } else {
          logoUrl = rawSrc;
        }
      }

      return {
        href,
        nameEn: rawName || nameAr,
        nameAr,
        logoUrl,
      };
    }).filter((s) => s.nameEn && s.logoUrl);
  });

  console.log(`Crawled ${crawledStores.length} stores from Narjis page.`);

  let updatedCount = 0;
  for (const store of crawledStores) {
    const normalizedCrawled = normalizeHsMerchantName(store.nameEn);
    console.log(`Crawled: "${store.nameEn}" -> Normalized: "${normalizedCrawled}" -> Logo: ${store.logoUrl}`);

    // Try to match with database merchants
    const match = merchants.find((m) => {
      const mNameLower = m.name_en.toLowerCase();
      const normLower = normalizedCrawled.toLowerCase();
      return mNameLower === normLower || mNameLower.includes(normLower) || normLower.includes(mNameLower);
    });

    if (match) {
      if (!match.logo_url || match.logo_url !== store.logoUrl) {
        match.logo_url = store.logoUrl;
        if (!match.name_ar && store.nameAr) {
          match.name_ar = store.nameAr;
        }
        await merchantRepo.save(match);
        console.log(`   ✅ Database Match! Updated logo for: "${match.name_en}"`);
        updatedCount++;
      } else {
        console.log(`   ℹ️ Database Match! Logo already up to date for: "${match.name_en}"`);
      }
    } else {
      console.log(`   ❌ No database match for: "${normalizedCrawled}"`);
    }
  }

  console.log(`\n🎉 Backfill complete! Updated ${updatedCount} merchants.`);
  await browser.close();
  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
