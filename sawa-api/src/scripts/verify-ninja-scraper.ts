import { Logger } from '@nestjs/common';
import { NinjaScraper } from '../ingestion/scraper/ninja-scraper';
import { RobotsTxtService } from '../ingestion/scraper/robots-txt.service';

async function verifyNinjaScraper() {
  const logger = new Logger('VerifyNinjaScraper');
  
  // Real robots.txt check logic for verification
  const robotsTxtService = new RobotsTxtService();
  
  // Manually instantiate scraper with a headless browser
  const ninjaScraper = new NinjaScraper(robotsTxtService, { headless: true });

  await ninjaScraper.launch();
  // Try a likely leaf category
  const url = 'https://ananinja.com/sa/en/category/milk';
  
  try {
    logger.log(`🔍 Scraping listing page (Page 1): ${url}`);
    
    const products = await ninjaScraper.scrapeListingPage(url, 1);
    
    logger.log(`✅ Success! Found ${products.length} products.`);
    
    if (products.length > 0) {
      logger.log('--- Samples ---');
      products.slice(0, 3).forEach((p, i) => {
        logger.log(`[${i+1}] ${p.name} - ${p.price} SAR - GTIN: ${p.gtin}`);
        logger.log(`    URL: ${p.productPageUrl}`);
      });
    } else {
      logger.warn('No products found on this page. Checking for subcategories...');
      const subcategories = await ninjaScraper.getSubcategories(url);
      if (subcategories.length > 0) {
        logger.log(`Found ${subcategories.length} subcategories:`);
        subcategories.forEach((sub, i) => {
          logger.log(`  [${i+1}] ${sub.name}: ${sub.url}`);
        });
      } else {
         logger.error('Neither products nor subcategories found. Site might be blocking or selectors failed.');
      }
    }

  } catch (error) {
    logger.error('❌ Scraper failed:', error);
  } finally {
    await ninjaScraper.close();
  }
}

verifyNinjaScraper().catch(console.error);
