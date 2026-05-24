import axios from 'axios';

async function main() {
  const url = 'https://parkcentersa.com/products?page=1';
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      },
      timeout: 10000,
    });
    const html = response.data;
    const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*"([^"]+)"/);
    if (!stateMatch) return;
    const base64Str = stateMatch[1];
    const decoded = Buffer.from(base64Str, 'base64').toString('utf-8');
    const state = JSON.parse(decoded);
    const apiAuth = state.apiAuthorization;
    const storeId = state.storeId;

    const apiHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
      'Referer': 'https://parkcentersa.com/',
      'Authorization': `Bearer ${apiAuth}`,
      'X-Authorization': apiAuth,
      'Store-Id': String(storeId),
      'X-Store-ID': String(storeId),
    };

    const apiRes = await axios.get(`https://parkcentersa.com/api/v1/products?page=1`, {
      headers: apiHeaders,
      timeout: 10000,
    });

    const products = apiRes.data.data.products.data || [];
    console.log(`Printing category & image structures:`);
    for (let i = 0; i < Math.min(products.length, 5); i++) {
      const p = products[i];
      console.log(`Product ${i+1}: "${p.name}"`);
      console.log(`  Categories:`, JSON.stringify(p.categories));
      console.log(`  Images:`, JSON.stringify(p.images));
    }
  } catch (err: any) {
    console.error('Error:', err.message);
  }
}

main();
