import axios from 'axios';

const stores = [
  { url: 'https://store.shonaksa.com', platform: 'salla', name: 'Shonaksa' },
  { url: 'https://yasminstore.com', platform: 'salla', name: 'Yasmin' },
  { url: 'https://mrlogman.com', platform: 'salla', name: 'Mr Logman' },
  { url: 'https://etaamexpress.com', platform: 'salla', name: 'Etaam Express' },
  { url: 'https://parkcentersa.com', platform: 'zid', name: 'Park Center' },
  { url: 'https://menhal.sa', platform: 'zid', name: 'Menhal' },
];

function parseSallaJsonLd(html: string): any[] {
  const results: any[] = [];
  const matches = html.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
  if (!matches) return results;

  for (const match of matches) {
    try {
      const jsonText = match
        .replace(/<script\s+type="application\/ld\+json">/i, '')
        .replace(/<\/script>/i, '')
        .trim();
      const json = JSON.parse(jsonText);
      const items = Array.isArray(json) ? json : [json];

      for (const obj of items) {
        if (obj['@type'] === 'ItemList' && Array.isArray(obj.itemListElement)) {
          for (const el of obj.itemListElement) {
            const product = el.item;
            if (product && product.name && product.url) {
              results.push({ name: product.name, url: product.url });
            }
          }
        }
        if (obj['@type'] === 'Product' && obj.name && obj.url) {
          results.push({ name: obj.name, url: obj.url });
        }
      }
    } catch { /* ignore */ }
  }
  return results;
}

async function searchStore(store: typeof stores[0], query: string) {
  const cleanUrl = store.url.endsWith('/') ? store.url.slice(0, -1) : store.url;
  try {
    if (store.platform === 'salla') {
      const searchUrl = `${cleanUrl}/ar/search?q=${encodeURIComponent(query)}`;
      const res = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        },
        timeout: 10000,
      });
      const candidates = parseSallaJsonLd(res.data);
      return candidates;
    } else {
      // Zid
      const searchUrl = `${cleanUrl}/products?q=${encodeURIComponent(query)}`;
      const res = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        },
        timeout: 10000,
      });
      const html = res.data;
      const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*"([^"]+)"/);
      if (stateMatch) {
        const decoded = Buffer.from(stateMatch[1], 'base64').toString('utf-8');
        const state = JSON.parse(decoded);
        const apiAuth = state.apiAuthorization;
        const storeId = state.storeId;
        if (apiAuth && storeId) {
          const apiUrl = `${cleanUrl}/api/v1/products?q=${encodeURIComponent(query)}`;
          const apiRes = await axios.get(apiUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
              'Authorization': `Bearer ${apiAuth}`,
              'Store-Id': String(storeId),
            },
            timeout: 10000,
          });
          if (apiRes.status === 200 && apiRes.data?.data?.products?.data) {
            return apiRes.data.data.products.data.map((p: any) => ({
              name: p.name,
              url: `${cleanUrl}/products/${p.slug}`
            }));
          }
        }
      }
    }
  } catch (err: any) {
    // console.log(`Search failed for ${store.name}: ${err.message}`);
  }
  return [];
}

async function main() {
  const queries = ['نادك', 'زبادي', 'nadec'];
  for (const query of queries) {
    console.log(`\n🔍 Searching for query: "${query}"`);
    for (const store of stores) {
      const results = await searchStore(store, query);
      if (results && results.length > 0) {
        console.log(`✨ Store: ${store.name} has matches:`);
        results.slice(0, 5).forEach((r) => {
          console.log(` - "${r.name}" -> ${r.url}`);
        });
      } else {
        console.log(`❌ Store: ${store.name} has 0 matches.`);
      }
    }
  }
}

main().catch(console.error);
