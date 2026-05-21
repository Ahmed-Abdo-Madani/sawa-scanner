import { chromium } from 'playwright';

const url = 'https://menhal.sa/products/%D8%B8%D8%B1%D9%81-%D9%86%D8%B5-%D9%83%D8%A7%D9%81%D9%8A-3%D9%81%D9%8A1';

async function inspectZidDetail() {
  console.log('🔍 Inspecting Zid product detail DOM structure...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8'
    });

    console.log(`Navigating to Zid product detail: ${url}`);
    await page.goto(url, { waitUntil: 'load', timeout: 30000 });
    await page.waitForTimeout(3000);

    const detailData = await page.evaluate(() => {
      // 1. Check for application/ld+json
      const ldScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
        .map(s => {
          try {
            return JSON.parse(s.textContent || '{}');
          } catch (e) {
            return { raw: s.textContent };
          }
        });

      // 2. Search for SKU/Barcode/GTIN text elements
      const allText = document.body.innerText;
      const potentialBarcodes = allText.match(/\b\d{8,14}\b/g) || [];

      // 3. Search for SKU label elements
      const elements = Array.from(document.querySelectorAll('span, p, div, li, td'))
        .filter(el => {
          const txt = el.textContent?.toLowerCase() || '';
          return txt.includes('sku') || txt.includes('barcode') || txt.includes('كود') || txt.includes('تسلسل');
        })
        .map(el => ({
          tag: el.tagName,
          class: el.className,
          text: el.textContent?.trim().substring(0, 100)
        }));

      return { ldScripts, potentialBarcodes: Array.from(new Set(potentialBarcodes)), elements: elements.slice(0, 15) };
    });

    console.log('Structured JSON-LD scripts found:', detailData.ldScripts.length);
    detailData.ldScripts.forEach((s, idx) => {
      console.log(`JSON-LD ${idx + 1}:`, JSON.stringify(s, null, 2).substring(0, 500) + '...');
    });
    console.log('Potential barcodes found in text:', detailData.potentialBarcodes);
    console.log('Elements containing SKU/Barcode labels:', detailData.elements);

  } catch (e: any) {
    console.error(`❌ Error: ${e.message}`);
  } finally {
    await browser.close();
  }
}

inspectZidDetail();
