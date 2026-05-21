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
    console.log(`HTML Length: ${html.length}`);

    // Check if JSON-LD scripts exist
    const jsonLdMatches = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
    console.log(`Found ${jsonLdMatches.length} application/ld+json scripts`);
    for (let i = 0; i < jsonLdMatches.length; i++) {
      const content = jsonLdMatches[i];
      console.log(`JSON-LD ${i}: ${content.substring(0, 300)}...`);
    }

    // Let's check for any links containing /products/
    const links = html.match(/href="([^"]*\/products\/[^"]*)"/gi) || [];
    console.log(`Found ${links.length} product links`);
    for (let i = 0; i < Math.min(10, links.length); i++) {
      console.log(`Link ${i}: ${links[i]}`);
    }

    // Let's search for tags or divs with class matching "product"
    const productClasses = html.match(/class="[^"]*product[^"]*"/gi) || [];
    const uniqueClasses = Array.from(new Set(productClasses));
    console.log(`Found ${uniqueClasses.length} unique product-related classes:`);
    console.log(uniqueClasses.slice(0, 20));

    // Let's print out some snippets around href="/products/"
    const firstProductLinkIndex = html.indexOf('/products/');
    if (firstProductLinkIndex !== -1) {
      console.log(`\n--- Snippet around first product link ---`);
      const start = Math.max(0, firstProductLinkIndex - 300);
      const end = Math.min(html.length, firstProductLinkIndex + 500);
      console.log(html.substring(start, end));
    }
  } catch (err: any) {
    console.error(`Failed: ${err.message}`);
  }
}

test();
