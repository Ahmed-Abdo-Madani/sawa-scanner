import { chromium } from 'playwright';

async function run() {
  const url = 'https://yasminstore.com/ar/search?q=6281057030040';
  console.log(`Navigating to Yasmin search: ${url}`);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    
    const elements = await page.evaluate(() => {
      const data: any[] = [];
      // Grab all anchor tags
      document.querySelectorAll('a').forEach(a => {
        const href = a.href || '';
        const text = a.textContent?.trim() || '';
        const html = a.outerHTML;
        
        // Let's filter to interesting looking anchors
        if (href && (href.includes('/p') || text.includes('نادك') || text.includes('زبادي'))) {
          data.push({
            tag: 'a',
            href,
            text,
            outerHTML: html.substring(0, 300),
          });
        }
      });
      
      // Grab custom salla tags
      const sallaTags: any[] = [];
      document.querySelectorAll('*').forEach(el => {
        const name = el.tagName.toLowerCase();
        if (name.startsWith('salla-') || name.includes('product')) {
          sallaTags.push({
            tagName: name,
            className: el.className,
            text: el.textContent?.trim().substring(0, 100),
          });
        }
      });
      
      return { anchors: data, sallaTags };
    });
    
    console.log(`\n--- ANCHORS (${elements.anchors.length}) ---`);
    elements.anchors.forEach((a, i) => {
      console.log(`[${i+1}] Href: ${a.href}`);
      console.log(`    Text: "${a.text}"`);
      console.log(`    HTML: ${a.outerHTML}`);
    });
    
    console.log(`\n--- SALLA/PRODUCT TAGS (${elements.sallaTags.length}) ---`);
    elements.sallaTags.slice(0, 30).forEach((t, i) => {
      console.log(`[${i+1}] Tag: <${t.tagName}>, Class: "${t.className}"`);
      console.log(`    Text snippet: "${t.text}"`);
    });
  } catch (err: any) {
    console.error(`Error: ${err.message}`);
  } finally {
    await browser.close();
  }
}

run();
