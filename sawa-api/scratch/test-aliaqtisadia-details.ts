import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AliaqtisadiaGtinArScraper } from '../src/ingestion/scraper/aliaqtisadia-gtin-ar-scraper';
import { RobotsTxtService } from '../src/ingestion/scraper/robots-txt.service';
import { ImageHashService } from '../src/ingestion/image-hash.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [AliaqtisadiaGtinArScraper, RobotsTxtService, ImageHashService],
})
class TestModule {}

async function main() {
  const app = await NestFactory.createApplicationContext(TestModule, { logger: ['error', 'warn'] });
  const scraper = app.get(AliaqtisadiaGtinArScraper);

  const testUrl = 'https://aliaqtisadia.sa/%D8%A7%D8%B1%D8%B2-%D9%87%D9%85%D8%AF%D8%A7%D9%86-%D8%B0%D9%87%D8%A8%D9%8A-8-5%D9%83-%D8%AD%D8%A8%D8%A9/p866303011';
  console.log(`Scraping details for: ${testUrl}...`);

  try {
    const details = await scraper.scrapeProductDetails(testUrl);
    console.log('Result details:', JSON.stringify(details, null, 2));
  } catch (err: any) {
    console.error('Error scraping details:', err.message);
  } finally {
    await app.close();
  }
}

main().catch(console.error);
