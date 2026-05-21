import axios from 'axios';
import { getRandomUA } from '../src/ingestion/scraper/evasion';

async function test() {
  const ua = getRandomUA('desktop');
  const url = 'https://parkcentersa.com/products?q=%D8%B4%D8%A7%D9%8A';

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
    const html = response.data;

    const match = html.match(/window\.__INITIAL_STATE__\s*=\s*"([^"]+)"/);
    if (!match) {
      console.log('window.__INITIAL_STATE__ not found');
      return;
    }

    const state = JSON.parse(Buffer.from(match[1], 'base64').toString('utf-8'));
    console.log('pre_fetch type:', typeof state.pre_fetch);
    console.log('pre_fetch keys:', Object.keys(state.pre_fetch || {}));
    console.log('all_products type:', typeof state.pre_fetch?.all_products);
    console.log('all_products content:', JSON.stringify(state.pre_fetch?.all_products, null, 2));

  } catch (err: any) {
    console.error(`Failed: ${err.message}`);
  }
}

test();
