import { RobotsTxtService } from './robots-txt.service';
import { PandaPriceScraper } from './panda-price-scraper';
import { OthaimPriceScraper } from './othaim-price-scraper';
import { TamimiPriceScraper } from './tamimi-price-scraper';
import { CarrefourPriceScraper } from './carrefour-price-scraper';

async function verify() {
  const robots = new RobotsTxtService();
  const config = { headless: true };

  const panda = new PandaPriceScraper(robots, config);
  const othaim = new OthaimPriceScraper(robots, config);
  const tamimi = new TamimiPriceScraper(robots, config);
  const carrefour = new CarrefourPriceScraper(robots, config);

  const testUrls = [
    { name: 'Panda', scraper: panda, url: 'https://panda.sa/en/product/750451' },
    { name: 'Othaim', scraper: othaim, url: 'https://www.noon.com/saudi-en/othaim-supermarket/' },
    { name: 'Tamimi', scraper: tamimi, url: 'https://www.tamimimarkets.com' },
    { name: 'Carrefour', scraper: carrefour, url: 'https://www.carrefourksa.com/mafksa/en/' }
  ];

  for (const test of testUrls) {
    console.log(`\n--- Testing ${test.name} ---`);
    try {
      await test.scraper.launch();
      
      // Test Detail Page for GTIN
      try {
        const detail = await test.scraper.scrapeDetailPage(test.url);
        console.log(`[${test.name}] Detail Result:`, {
          name: detail.name,
          price: detail.price,
          gtin: detail.gtin,
          inStock: detail.inStock
        });
      } catch (e) {
        console.warn(`[${test.name}] Detail page scrape failed (likely invalid URL):`, e.message);
      }

    } catch (err) {
      if (err.message.includes('document is not defined')) {
        console.error(`[${test.name}] FAILED: DOM access crash!`, err);
      } else {
        console.warn(`[${test.name}] Warning:`, err.message);
      }
    } finally {
      await test.scraper.close();
    }
  }
}

verify();
