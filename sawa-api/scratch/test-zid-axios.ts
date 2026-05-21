import axios from 'axios';
import { getRandomUA } from '../src/ingestion/scraper/evasion';

async function test() {
  const ua = getRandomUA('desktop');
  const urls = [
    'https://parkcentersa.com/products?q=%D8%B4%D8%A7%D9%8A',
    'https://parkcentersa.com/products?page=1',
    'https://parkcentersa.com/products'
  ];

  for (const url of urls) {
    console.log(`\n--- Fetching: ${url} ---`);
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
          'Referer': 'https://parkcentersa.com/',
          'Connection': 'keep-alive',
        },
        timeout: 10000,
      });
      console.log(`Status: ${response.status}`);
      console.log(`HTML Length: ${response.data?.length}`);
      console.log(`Contains products? ${response.data?.includes('product')}`);
      // Print first 500 chars
      console.log(`Sample: ${response.data?.substring(0, 500)}`);
    } catch (err: any) {
      console.error(`Failed: ${err.message}`);
      if (err.response) {
        console.error(`Status: ${err.response.status}`);
        console.error(`Sample Body: ${err.response.data?.substring(0, 500)}`);
      }
    }
  }
}

test();
