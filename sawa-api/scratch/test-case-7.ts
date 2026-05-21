import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EtaamGtinArScraper } from '../src/ingestion/scraper/etaam-gtin-ar-scraper';
import { RobotsTxtService } from '../src/ingestion/scraper/robots-txt.service';
import { ImageHashService } from '../src/ingestion/image-hash.service';

async function diagnose() {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    providers: [
      EtaamGtinArScraper,
      ImageHashService,
      {
        provide: RobotsTxtService,
        useValue: { isAllowed: async () => true },
      },
      {
        provide: ConfigService,
        useValue: {
          get: (key: string) => {
            if (key === 'scraper') return { headless: true };
            return null;
          },
        },
      },
    ],
  }).compile();

  const scraperAr = moduleFixture.get<EtaamGtinArScraper>(EtaamGtinArScraper);
  const hashService = moduleFixture.get<ImageHashService>(ImageHashService);

  // Set up mock context and page
  scraperAr.ensureLaunched = async () => {};
  scraperAr.launch = async () => {};
  scraperAr.close = async () => {};
  (scraperAr as any).navigateWithEvasion = async () => {};
  (scraperAr as any).applyThrottling = async () => {};
  
  const mockPageAr = {
    close: async () => {},
    waitForTimeout: async () => {},
    evaluate: async () => {
      console.log('Mock page.evaluate called!');
      return [
        {
          name: 'ميريندا برتقال 320مل',
          url: 'https://etaamexpress.com/ar/product/mirinda-orange-320',
          image: 'https://etaamexpress.com/images/arabic-mirinda.png',
        }
      ];
    },
  };
  (scraperAr as any).context = {
    newPage: async () => mockPageAr,
  };

  hashService.generateHashFromUrl = async (url: string) => {
    console.log('Mock generateHashFromUrl called for:', url);
    return 'aaaa5555aaaa5554';
  };

  // Capture Logger outputs to stdout
  (scraperAr as any).logger = {
    log: (msg: string) => console.log('LOG:', msg),
    debug: (msg: string) => console.log('DEBUG:', msg),
    warn: (msg: string) => console.log('WARN:', msg),
    error: (msg: string, stack?: string) => console.error('ERROR:', msg, stack),
  };

  console.log('Running searchAndGetBestMatch...');
  const match = await scraperAr.searchAndGetBestMatch(
    'ميريندا برتقال مشروب غازي 325مل',
    0.7,
    ['aaaa5555aaaa5555'],
  );
  console.log('Match Result:', match);
}

diagnose().catch(console.error);
