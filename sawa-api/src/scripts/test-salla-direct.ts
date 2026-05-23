import axios from 'axios';

const stores = [
  'https://store.shonaksa.com',
  'https://yasminstore.com',
  'https://mrlogman.com',
  'https://etaamexpress.com'
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
              results.push({
                name: product.name,
                url: product.url,
              });
            }
          }
        }
        if (obj['@type'] === 'Product' && obj.name && obj.url) {
          results.push({
            name: obj.name,
            url: obj.url,
          });
        }
        if (Array.isArray(obj.itemListElement)) {
          for (const el of obj.itemListElement) {
            if (el.item?.['@type'] === 'Product' && el.item.name && el.item.url) {
              results.push({
                name: el.item.name,
                url: el.item.url,
              });
            }
          }
        }
      }
    } catch { /* ignore */ }
  }
  return results;
}

async function testName(query: string) {
  console.log(`🔍 SEARCHING SALLA FOR NAME: "${query}"`);
  for (const store of stores) {
    const searchUrl = `${store}/ar/search?q=${encodeURIComponent(query)}`;
    try {
      const res = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
        },
        timeout: 10000,
      });
      const candidates = parseSallaJsonLd(res.data);
      console.log(`Store ${store}: Found ${candidates.length} candidates.`);
      candidates.forEach((c) => {
        console.log(` - "${c.name}" -> ${c.url}`);
      });
    } catch (err: any) {
      console.log(`Store ${store} failed: ${err.message}`);
    }
  }
}

testName('نادك');
