import axios from 'axios';
import { getRandomUA } from '../src/ingestion/scraper/evasion';

async function run() {
  const barcode = '6291003011856';
  const ua = getRandomUA('desktop');

  // Test 1: with search parameter 'search'
  const urlSearch = `https://mo0o0nat.com/products?search=${barcode}`;
  console.log(`\n--- Test 1: Fetching with 'search' parameter: ${urlSearch} ---`);
  try {
    console.log('Sending Axios GET...');
    const response = await axios.get(urlSearch, {
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
        'Connection': 'keep-alive',
      },
      timeout: 15000,
    });
    console.log(`Response status: ${response.status}`);
    const html = response.data;
    console.log(`HTML length: ${html.length}`);
    const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*"([^"]+)"/);
    if (stateMatch) {
      console.log('Found INITIAL_STATE!');
      const decoded = Buffer.from(stateMatch[1], 'base64').toString('utf-8');
      const state = JSON.parse(decoded);
      const apiAuth = state.apiAuthorization;
      const storeId = state.storeId;
      console.log(`auth: ${apiAuth ? 'yes' : 'no'}, storeId: ${storeId}`);

      const apiUrl = `https://mo0o0nat.com/api/v1/products?search=${barcode}`;
      console.log(`Querying Zid API: ${apiUrl}`);
      const apiRes = await axios.get(apiUrl, {
        headers: {
          'Authorization': `Bearer ${apiAuth}`,
          'Store-Id': String(storeId),
          'User-Agent': ua,
        },
        timeout: 10000,
      });
      console.log(`API response status: ${apiRes.status}, count: ${apiRes.data?.products?.length ?? 0}`);
    } else {
      console.log('INITIAL_STATE not found in HTML.');
    }
  } catch (e: any) {
    console.error(`Test 1 failed: ${e.message}`);
    if (e.response) {
      console.error(`Status: ${e.response.status}, Data: ${JSON.stringify(e.response.data).substring(0, 200)}`);
    }
  }

  // Test 2: with search parameter 'q'
  const urlQ = `https://mo0o0nat.com/products?q=${barcode}`;
  console.log(`\n--- Test 2: Fetching with 'q' parameter: ${urlQ} ---`);
  try {
    console.log('Sending Axios GET...');
    const response = await axios.get(urlQ, {
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
        'Connection': 'keep-alive',
      },
      timeout: 15000,
    });
    console.log(`Response status: ${response.status}`);
    const html = response.data;
    console.log(`HTML length: ${html.length}`);
    const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*"([^"]+)"/);
    if (stateMatch) {
      console.log('Found INITIAL_STATE!');
      const decoded = Buffer.from(stateMatch[1], 'base64').toString('utf-8');
      const state = JSON.parse(decoded);
      const apiAuth = state.apiAuthorization;
      const storeId = state.storeId;
      console.log(`auth: ${apiAuth ? 'yes' : 'no'}, storeId: ${storeId}`);

      const apiUrl = `https://mo0o0nat.com/api/v1/products?q=${barcode}`;
      console.log(`Querying Zid API: ${apiUrl}`);
      const apiRes = await axios.get(apiUrl, {
        headers: {
          'Authorization': `Bearer ${apiAuth}`,
          'Store-Id': String(storeId),
          'User-Agent': ua,
        },
        timeout: 10000,
      });
      console.log(`API response status: ${apiRes.status}, count: ${apiRes.data?.products?.length ?? 0}`);
      if (apiRes.data?.products) {
        for (const p of apiRes.data.products) {
          console.log(`- Product: "${p.name}", slug: "${p.slug}"`);
        }
      }
    } else {
      console.log('INITIAL_STATE not found in HTML.');
    }
  } catch (e: any) {
    console.error(`Test 2 failed: ${e.message}`);
    if (e.response) {
      console.error(`Status: ${e.response.status}, Data: ${JSON.stringify(e.response.data).substring(0, 200)}`);
    }
  }
}

run();
