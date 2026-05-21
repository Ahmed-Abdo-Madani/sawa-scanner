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
    
    console.log('--- RECURSIVE ANALYSIS OF DECODED STATE ---');
    
    // Find all arrays and print their paths, sizes and sample elements
    findArrays(state, 'state');

  } catch (err: any) {
    console.error(`Failed: ${err.message}`);
  }
}

function findArrays(obj: any, path: string) {
  if (!obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    console.log(`Array found at: ${path} (Length: ${obj.length})`);
    if (obj.length > 0) {
      const sample = obj[0];
      console.log(`  Sample element type: ${typeof sample}`);
      if (typeof sample === 'object' && sample !== null) {
        console.log(`  Sample element keys:`, Object.keys(sample).slice(0, 10));
        if (sample.name || sample.title || sample.id || sample.sku) {
          console.log(`  Sample name/title/id/sku:`, sample.name || sample.title || sample.id || sample.sku);
        }
      } else {
        console.log(`  Sample element value:`, String(sample).substring(0, 100));
      }
    }
    // Don't recurse into arrays of primitives
    if (obj.length > 0 && typeof obj[0] !== 'object') {
      return;
    }
  }

  for (const key of Object.keys(obj)) {
    // Avoid circular or extremely deep structures if any
    try {
      findArrays(obj[key], `${path}.${key}`);
    } catch { /* ignore */ }
  }
}

test();
