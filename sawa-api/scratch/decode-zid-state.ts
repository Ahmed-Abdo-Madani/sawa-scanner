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

    // Search for window.__INITIAL_STATE__
    const match = html.match(/window\.__INITIAL_STATE__\s*=\s*"([^"]+)"/);
    if (!match) {
      console.log('window.__INITIAL_STATE__ not found');
      return;
    }

    const base64Str = match[1];
    console.log(`Found base64 state string of length: ${base64Str.length}`);

    const decoded = Buffer.from(base64Str, 'base64').toString('utf-8');
    console.log(`Decoded string length: ${decoded.length}`);

    const state = JSON.parse(decoded);
    const fs = require('fs');
    fs.writeFileSync('scratch/zid-state.json', JSON.stringify(state, null, 2), 'utf-8');
    console.log('Saved state to scratch/zid-state.json');

    // Attempt to hit Zid storefront api/v1/products using headers from state
    const apiAuth = state.apiAuthorization;
    const storeId = state.storeId;
    console.log(`Extracted apiAuthorization: ${apiAuth}, storeId: ${storeId}`);

    const apiHeaders = {
      'User-Agent': ua,
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
      'Referer': 'https://parkcentersa.com/',
      'Authorization': apiAuth ? `Bearer ${apiAuth}` : undefined,
      'X-Authorization': apiAuth,
      'Store-Id': storeId ? String(storeId) : undefined,
      'X-Store-ID': storeId ? String(storeId) : undefined,
    };

    console.log('Hitting: https://parkcentersa.com/api/v1/products?q=شاي ...');
    try {
      const apiRes = await axios.get('https://parkcentersa.com/api/v1/products?q=%D8%B4%D8%A7%D9%8A', {
        headers: apiHeaders as any,
        timeout: 10000,
      });
      console.log('API Response status:', apiRes.status);
      console.log('API Response data keys:', Object.keys(apiRes.data));
      if (apiRes.data.products && Array.isArray(apiRes.data.products)) {
        console.log(`Found ${apiRes.data.products.length} products!`);
        console.log('Sample product 0 name:', apiRes.data.products[0].name);
        console.log('Sample product 0 images:', apiRes.data.products[0].images);
        console.log('Sample product 0 url:', apiRes.data.products[0].url);
      } else if (apiRes.data.results && Array.isArray(apiRes.data.results)) {
        console.log(`Found ${apiRes.data.results.length} results!`);
        console.log('Sample product 0 name:', apiRes.data.results[0].name);
      } else {
        console.log('API response body sample:', JSON.stringify(apiRes.data).substring(0, 1000));
      }
    } catch (apiErr: any) {
      console.error('API call failed:', apiErr.message);
      if (apiErr.response) {
        console.error('API error status:', apiErr.response.status, 'body:', JSON.stringify(apiErr.response.data).substring(0, 500));
      }
    }

    // Let's search for "products" recursively or dump product keys if we find them
    fsSearch(state, 'all_products');
    fsSearch(state, 'products');

  } catch (err: any) {
    console.error(`Failed: ${err.message}`);
  }
}

function fsSearch(obj: any, targetKey: string, path: string = '') {
  if (!obj || typeof obj !== 'object') return;
  
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      fsSearch(obj[i], targetKey, `${path}[${i}]`);
    }
    return;
  }

  for (const key of Object.keys(obj)) {
    if (key === targetKey) {
      console.log(`Found target key at: state${path}.${key}`);
      const val = obj[key];
      if (Array.isArray(val)) {
        console.log(`Array length: ${val.length}`);
        if (val.length > 0) {
          console.log(`Sample item 0 keys:`, Object.keys(val[0]));
          console.log(`Sample item 0 preview:`, JSON.stringify(val[0]).substring(0, 500));
        }
      } else {
        console.log(`Value type:`, typeof val);
      }
    } else {
      fsSearch(obj[key], targetKey, `${path}.${key}`);
    }
  }
}

test();
