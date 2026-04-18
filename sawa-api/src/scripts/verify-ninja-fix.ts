import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { NinjaScraper } from '../ingestion/scraper/ninja-scraper';
import { RobotsTxtService } from '../ingestion/scraper/robots-txt.service';

async function verify() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const robots = app.get(RobotsTxtService);
  const scraper = new NinjaScraper(robots, {
    headless: true,
    deviceProfile: 'mobile',
  });

  await scraper.launch();

  try {
    const targets = [
      'https://ananinja.com/sa/en/product/19304137',
      'https://ananinja.com/sa/en/product/19289885',
    ];

    console.log('--- Verifying Price Mapping ---');
    for (const url of targets) {
      console.log(`Checking ${url}...`);
      const product = await scraper.scrapeDetailPage(url);
      console.log(`Product: ${product.name}`);
      console.log(`Price: ${product.price} (Expected > 0)`);
      console.log(`Images: ${product.imageUrls.length}`);
      console.log('---------------------------');
    }

    console.log('\n--- Verifying Restaurant Exclusion ---');
    const rootUrl = 'https://ananinja.com/sa/en';
    const subcats = await scraper.getSubcategories(rootUrl);
    const restaurants = subcats.filter(
      (s) => s.url.includes('/restaurant/') || s.url.includes('cuisine'),
    );
    console.log(`Total subcategories found: ${subcats.length}`);
    console.log(
      `Restaurant categories found: ${restaurants.length} (Expected 0)`,
    );
    if (restaurants.length > 0) {
      console.log(
        'Sample restaurants found:',
        restaurants.slice(0, 3).map((r) => r.url),
      );
    }
  } catch (err) {
    console.error('Verification failed:', err);
  } finally {
    await scraper.close();
    await app.close();
  }
}

verify();
