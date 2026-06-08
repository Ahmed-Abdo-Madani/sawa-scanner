const { chromium } = require('playwright');
const fs = require('fs');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const url = 'https://hungerstation.com/sa-en/qc/96386/Dolphin/branch/riyadh~yasmin~171560';
  console.log(`Navigating to ${url}...`);
  
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(5000);

    const nextDataJson = await page.evaluate(() => {
      const script = document.getElementById('__NEXT_DATA__');
      return script ? JSON.parse(script.textContent) : null;
    });

    if (!nextDataJson) {
      console.log('No __NEXT_DATA__ found');
      return;
    }

    console.log('__NEXT_DATA__ found. Keys at root:', Object.keys(nextDataJson));
    console.log('Keys in props:', Object.keys(nextDataJson.props || {}));
    if (nextDataJson.props?.pageProps) {
      console.log('Keys in pageProps:', Object.keys(nextDataJson.props.pageProps));
      
      // Let's search for menu or categories inside pageProps
      const pageProps = nextDataJson.props.pageProps;
      fs.writeFileSync('scratch/yasmin-pageprops-keys.json', JSON.stringify({
        keys: Object.keys(pageProps),
        menu: pageProps.menu ? 'exists' : 'missing',
        branch: pageProps.branch ? 'exists' : 'missing',
        categories: pageProps.categories ? 'exists' : 'missing',
        store: pageProps.store ? 'exists' : 'missing',
      }, null, 2));

      // Write a sample of pageProps to examine
      fs.writeFileSync('scratch/yasmin-pageprops-sample.json', JSON.stringify(pageProps, (key, value) => {
        // Truncate large arrays or strings for readability
        if (typeof value === 'string' && value.length > 500) return value.substring(0, 500) + '...';
        if (Array.isArray(value) && value.length > 5) return [value[0], `... (${value.length - 1} more items)`];
        return value;
      }, 2));

      console.log('Saved pageProps keys and sample to scratch folder.');
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await browser.close();
  }
}

main();
