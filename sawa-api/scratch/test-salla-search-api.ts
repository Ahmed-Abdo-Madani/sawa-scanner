import axios from 'axios';

const stores = [
  'https://store.shonaksa.com',
  'https://yasminstore.com',
  'https://mrlogman.com'
];

const keywords = ['حليب', 'ماء', 'شاي'];

async function testSearchAPI() {
  console.log('🔍 Querying Salla search endpoints with common keywords...\n');

  for (const store of stores) {
    console.log(`==================================================`);
    console.log(`STORE: ${store}`);
    for (const kw of keywords) {
      const url = `${store}/ar/search?q=${encodeURIComponent(kw)}`;
      try {
        const response = await axios.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8'
          },
          timeout: 10000
        });

        console.log(`Keyword '${kw}' -> HTTP Status: ${response.status}`);
        const data = response.data;
        if (data && data.results) {
          console.log(`  Results count: ${data.results.length}`);
          if (data.results.length > 0) {
            console.log(`  First result: ${JSON.stringify(data.results[0]).substring(0, 300)}...`);
          }
        } else {
          console.log(`  Response type: ${typeof data}`);
          console.log(`  Response: ${JSON.stringify(data).substring(0, 300)}...`);
        }
      } catch (error: any) {
        console.error(`  ❌ Failed for '${kw}': ${error.message}`);
      }
    }
  }
  console.log(`==================================================`);
}

testSearchAPI();
