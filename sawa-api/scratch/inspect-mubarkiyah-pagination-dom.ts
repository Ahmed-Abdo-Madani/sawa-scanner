import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
chromium.use(StealthPlugin());

async function run() {
  console.log('🚀 Launching browser to inspect pagination DOM on search?c=73...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();
  try {
    await page.goto('https://mubarkiyah.com/search?c=73', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(4000);

    // Get pagination element info
    const paginationInfo = await page.evaluate(() => {
      // Find elements containing page numbers or pagination controls
      const links = Array.from(document.querySelectorAll('a, button, li'));
      const pageElements = links.map(el => ({
        tagName: el.tagName,
        className: el.className,
        text: el.textContent?.trim() || '',
        html: el.outerHTML,
        href: (el as any).href || null
      })).filter(el => {
        const text = el.text;
        return (text === '2' || text === 'التالي' || text === 'Next' || text.includes('page') || (el.href && el.href.includes('page')));
      });

      return {
        pageElements,
        bodyHtmlSnippet: document.body.innerHTML.substring(0, 1000)
      };
    });

    console.log('--- PAGINATION ELEMENTS FOUND ---');
    console.log(JSON.stringify(paginationInfo.pageElements, null, 2));

  } catch (e: any) {
    console.error(`Error: ${e.message}`);
  } finally {
    await browser.close();
  }
}

run();
