import axios from 'axios';
import { getRandomUA } from '../src/ingestion/scraper/evasion';

const testUrls = [
  'https://menhal.sa/products?q=%D8%B4%D8%A7%D9%8A', // Zid search
  'https://parkcentersa.com/products?q=%D8%B4%D8%A7%D9%8A', // Zid search
  'https://store.shonaksa.com/ar/search?q=%D8%B4%D8%A7%D9%8A', // Salla search
  'https://yasminstore.com/ar/search?q=%D8%B4%D8%A7%D9%8A' // Salla search
];

async function testHighSpeedAxios() {
  console.log('🚀 Testing high-speed Axios parsing for Salla/Zid...');

  for (const url of testUrls) {
    console.log(`\n--------------------------------------------------`);
    console.log(`URL: ${url}`);
    const ua = getRandomUA('desktop');

    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': ua,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
          'Referer': new URL(url).origin,
          'Connection': 'keep-alive'
        },
        timeout: 10000,
        validateStatus: () => true
      });

      console.log(`Status Code: ${response.status}`);
      let body = '';
      if (typeof response.data === 'string') {
        body = response.data;
      } else if (response.data) {
        body = JSON.stringify(response.data);
      }

      console.log(`Response length: ${body.length} bytes`);

      if (response.status === 200) {
        // Check for JSON-LD scripts
        const ldMatches = body.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
        console.log(`JSON-LD <script> tags found: ${ldMatches ? ldMatches.length : 0}`);
        if (ldMatches && ldMatches.length > 0) {
          console.log(`Sample JSON-LD tag snippet: ${ldMatches[0].substring(0, 300)}...`);
        }

        // Zid product-item or product-card class checks
        const productItems = body.match(/class="[^"]*product-item[^"]*"/gi) || [];
        const productCards = body.match(/class="[^"]*product-card[^"]*"/gi) || [];
        console.log(`Zid '.product-item' class occurrences: ${productItems.length}`);
        console.log(`Zid '.product-card' class occurrences: ${productCards.length}`);
      }

    } catch (e: any) {
      console.error(`❌ Axios request failed: ${e.message}`);
    }
  }
}

testHighSpeedAxios();
