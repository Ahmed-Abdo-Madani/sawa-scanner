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
    console.log('apiAuthorization:', state.apiAuthorization);
    console.log('storeId:', state.storeId);
    console.log('baseUrl:', state.baseUrl);
    console.log('csrfToken:', state.csrfToken);
    console.log('store.uuid:', state.store?.uuid);
    
  } catch (err: any) {
    console.error(`Failed: ${err.message}`);
  }
}

test();
