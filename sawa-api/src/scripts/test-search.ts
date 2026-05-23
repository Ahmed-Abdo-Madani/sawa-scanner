import axios from 'axios';

const stores = [
  { url: 'https://store.shonaksa.com', platform: 'salla' },
  { url: 'https://yasminstore.com', platform: 'salla' },
  { url: 'https://mrlogman.com', platform: 'salla' },
  { url: 'https://etaamexpress.com', platform: 'salla' },
  { url: 'https://parkcentersa.com', platform: 'zid' },
  { url: 'https://menhal.sa', platform: 'zid' },
];

function parseSallaJsonLd(html: string): any[] {
  const results: any[] = [];
  const matches = html.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
  if (!matches) return results;

  function parseImageUrl(imageField: any): string | null {
    if (!imageField) return null;
    if (typeof imageField === 'string') return imageField;
    if (Array.isArray(imageField) && imageField.length > 0) {
      const first = imageField[0];
      if (typeof first === 'string') return first;
      return first?.url || null;
    }
    if (typeof imageField === 'object') {
      return imageField.url || null;
    }
    return null;
  }

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
              results.push({
                name: product.name,
                url: product.url,
                image: parseImageUrl(product.image),
              });
            }
          }
        }

        if (obj['@type'] === 'Product' && obj.name && obj.url) {
          results.push({
            name: obj.name,
            url: obj.url,
            image: parseImageUrl(obj.image),
          });
        }

        if (Array.isArray(obj.itemListElement)) {
          for (const el of obj.itemListElement) {
            if (el.item?.['@type'] === 'Product' && el.item.name && el.item.url) {
              results.push({
                name: el.item.name,
                url: el.item.url,
                image: parseImageUrl(el.item.image),
              });
            }
          }
        }
      }
    } catch { /* ignore */ }
  }
  return results;
}

async function testBarcode(barcode: string) {
  console.log(`\n======================================================`);
  console.log(`🔍 DIAGNOSING BARCODE SEARCH: ${barcode}`);
  console.log(`======================================================`);

  for (const store of stores) {
    const cleanUrl = store.url.endsWith('/') ? store.url.slice(0, -1) : store.url;
    console.log(`\n--- Store: ${cleanUrl} (${store.platform.toUpperCase()}) ---`);

    try {
      if (store.platform === 'salla') {
        const searchUrl = `${cleanUrl}/ar/search?q=${barcode}`;
        console.log(`Fetching Salla search: ${searchUrl}`);
        
        const response = await axios.get(searchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
            'Referer': cleanUrl,
          },
          timeout: 10000,
        });

        if (response.status === 200) {
          const candidates = parseSallaJsonLd(response.data);
          console.log(`Found ${candidates.length} Salla candidates via JSON-LD:`);
          candidates.forEach((c, idx) => {
            console.log(`  [${idx + 1}] Name: "${c.name}"`);
            console.log(`      URL:  ${c.url}`);
            console.log(`      Img:  ${c.image}`);
          });
          if (candidates.length === 0) {
            console.log('No JSON-LD products parsed. Search might have returned no products or formatted differently.');
          }
        } else {
          console.log(`Failed to fetch Salla search page: Status ${response.status}`);
        }
      } else {
        // Zid
        const searchUrl = `${cleanUrl}/products?q=${barcode}`;
        console.log(`Fetching Zid page: ${searchUrl}`);
        
        const response = await axios.get(searchUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
            'Referer': cleanUrl,
          },
          timeout: 10000,
        });

        if (response.status === 200) {
          const html = response.data;
          const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*"([^"]+)"/);
          if (stateMatch) {
            const base64Str = stateMatch[1];
            const decoded = Buffer.from(base64Str, 'base64').toString('utf-8');
            const state = JSON.parse(decoded);
            const apiAuth = state.apiAuthorization;
            const storeId = state.storeId;
            
            console.log(`Zid state found. Auth: ${apiAuth ? 'YES' : 'NO'}, Store ID: ${storeId}`);
            if (apiAuth && storeId) {
              const apiUrl = `${cleanUrl}/api/v1/products?q=${barcode}`;
              console.log(`Querying Zid API directly: ${apiUrl}`);
              
              const apiRes = await axios.get(apiUrl, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                  'Accept': 'application/json, text/plain, */*',
                  'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
                  'Referer': `${cleanUrl}/`,
                  'Authorization': `Bearer ${apiAuth}`,
                  'X-Authorization': apiAuth,
                  'Store-Id': String(storeId),
                  'X-Store-ID': String(storeId),
                },
                timeout: 10000,
              });

              if (apiRes.status === 200 && apiRes.data?.data?.products?.data) {
                const apiProducts = apiRes.data.data.products.data;
                console.log(`Found ${apiProducts.length} products from Zid API:`);
                apiProducts.forEach((p: any, idx: number) => {
                  console.log(`  [${idx + 1}] Name: "${p.name}"`);
                  console.log(`      Slug: ${p.slug}`);
                });
              } else {
                console.log('No Zid products returned in API response.');
              }
            }
          } else {
            console.log('Zid initial state not found in HTML.');
          }
        } else {
          console.log(`Failed to fetch Zid page: Status ${response.status}`);
        }
      }
    } catch (err: any) {
      console.error(`Error querying store:`, err.message);
    }
  }
}

async function main() {
  await testBarcode('6281057030040');
}

main();
