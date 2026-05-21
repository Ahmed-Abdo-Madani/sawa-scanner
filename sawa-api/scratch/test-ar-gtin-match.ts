import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EtaamGtinArScraper } from '../src/ingestion/scraper/etaam-gtin-ar-scraper';
import { RobotsTxtService } from '../src/ingestion/scraper/robots-txt.service';

async function bootstrap() {
  console.log('🧪 Bootstrapping verification test module...');
  const moduleFixture: TestingModule = await Test.createTestingModule({
    providers: [
      EtaamGtinArScraper,
      {
        provide: RobotsTxtService,
        useValue: { isAllowed: async () => true },
      },
      {
        provide: ConfigService,
        useValue: {
          get: (key: string) => {
            if (key === 'scraper') {
              return {
                headless: true,
                channel: 'chrome',
                cookieSessionPath: './scraper-sessions/etaam-ar',
                deviceProfile: 'desktop',
              };
            }
            return null;
          },
        },
      },
    ],
  }).compile();

  const scraper = moduleFixture.get<EtaamGtinArScraper>(EtaamGtinArScraper);

  try {
    console.log('🚀 Launching scraper headlessly with pre-warmed context...');
    await scraper.ensureLaunched();

    const searchQuery = 'ريتا مشروب غازي توت مشكل 275 مل';
    console.log(`🧭 Searching for: "${searchQuery}" ...`);
    const match = await scraper.searchAndGetBestMatch(searchQuery, 0.6);

    if (match) {
      console.log('✅ Found match!');
      console.log(`🔗 Name: "${match.name}"`);
      console.log(`🔗 URL: ${match.url}`);
      console.log(`🔗 Similarity: ${match.similarity.toFixed(3)}`);

      console.log('🧭 Scraping GTIN from product page...');
      const gtin = await scraper.scrapeGtinFromProductPage(match.url);
      console.log(`🎉 Extracted GTIN: "${gtin}"`);
    } else {
      console.log('❌ No match found.');
    }
  } catch (err) {
    console.error('❌ Error during verification:', err);
  } finally {
    await scraper.close();
    console.log('👋 Done.');
  }
}

bootstrap();
