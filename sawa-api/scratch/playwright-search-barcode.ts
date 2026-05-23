import { chromium } from 'playwright';

const stores = [
  { name: 'Shonaksa', url: 'https://store.shonaksa.com' },
  { name: 'Yasmin', url: 'https://yasminstore.com' },
  { name: 'Mr Logman', url: 'https://mrlogman.com' },
  { name: 'Etaam Express', url: 'https://etaamexpress.com' },
  { name: 'Park Center', url: 'https://parkcentersa.com' },
  { name: 'Menhal', url: 'https://menhal.sa' },
];

async function run() {
  const barcode = '6281057030040';
  console.log(`🚀 Starting Playwright search for barcode: ${barcode}`);
  
  const browser = await chromium.launch({ headless: true });
  
  for (const store of stores) {
    console.log(`\n==================================================`);
    console.log(`STORE: ${store.name} (${store.url})`);
    
    const page = await browser.newPage();
    try {
      // Navigate to the search URL directly
      let searchUrl = '';
      if (store.url.includes('menhal') || store.url.includes('parkcenter')) {
        searchUrl = `${store.url}/products?q=${barcode}`;
      } else {
        searchUrl = `${store.url}/ar/search?q=${barcode}`;
      }
      
      console.log(`Navigating to search URL: ${searchUrl}`);
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      
      // Wait 5 seconds for hydration and client-side rendering
      console.log('Waiting 5 seconds for client-side rendering...');
      await page.waitForTimeout(5000);
      
      const title = await page.title();
      console.log(`Final URL: ${page.url()}`);
      console.log(`Page Title: "${title}"`);
      
      // Let's inspect the page content for links containing product-like paths or custom elements
      const results = await page.evaluate(() => {
        const found: any[] = [];
        
        // 1. Look for salla custom product cards
        document.querySelectorAll('salla-product-card, custom-salla-product-card, salla-products-list a, .product-item, .product-card, a').forEach(el => {
          const tagName = el.tagName.toLowerCase();
          const className = el.className || '';
          const href = (el as HTMLAnchorElement).href || '';
          const text = el.textContent?.trim() || '';
          
          // Filter out very generic links
          if (href && (href.includes('/p/') || href.includes('/products/') || className.includes('product') || tagName.includes('product'))) {
            found.push({
              tag: tagName,
              class: className,
              href: href,
              text: text.substring(0, 100).replace(/\s+/g, ' '),
            });
          }
        });
        
        // 2. Let's extract any visible text that might contain product name
        return {
          links: found,
          bodyText: document.body.innerText.substring(0, 1000).replace(/\s+/g, ' '),
        };
      });
      
      console.log(`Visible Body text (first 1000 chars):`);
      console.log(results.bodyText);
      
      console.log(`Found ${results.links.length} potential product links:`);
      const uniqueLinks = Array.from(new Set(results.links.map(l => JSON.stringify(l)))).map(s => JSON.parse(s));
      uniqueLinks.slice(0, 15).forEach((link, idx) => {
        console.log(`  [${idx + 1}] Tag: <${link.tag}>, Class: "${link.class}"`);
        console.log(`      Href: ${link.href}`);
        console.log(`      Text: "${link.text}"`);
      });
      
    } catch (err: any) {
      console.error(`❌ Error scanning ${store.name}: ${err.message}`);
    } finally {
      await page.close();
    }
  }
  
  await browser.close();
  console.log('\n👋 Done.');
}

run();
