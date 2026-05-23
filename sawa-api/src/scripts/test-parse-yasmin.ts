import axios from 'axios';
import { chromium } from 'playwright-extra';
import stealthPlugin from 'puppeteer-extra-plugin-stealth';

// @ts-ignore
chromium.use(stealthPlugin());

async function testYasmin() {
  const barcode = '6265302840660';
  const url = `https://yasminstore.com/search?q=${barcode}`;
  
  console.log(`🔍 Testing search via Axios for URL: ${url}`);
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'ar,en;q=0.9',
      }
    });
    console.log(`Axios Success. HTML Length: ${res.data.length}`);
    const ldMatches = res.data.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
    if (ldMatches) {
      console.log(`Found ${ldMatches.length} ld+json scripts via Axios.`);
      for (const ld of ldMatches) {
        if (ld.includes('Product') || ld.includes('ItemList')) {
          console.log(ld.slice(0, 500));
        }
      }
    } else {
      console.log('No ld+json found via Axios.');
    }
  } catch (e: any) {
    console.log(`Axios failed: ${e.message}`);
  }

  console.log('\n🔍 Testing search via Playwright Stealth...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    console.log('Page loaded. Waiting 3 seconds for client hydration...');
    await page.waitForTimeout(3000);

    const bodyHtml = await page.content();
    console.log(`Playwright HTML Length: ${bodyHtml.length}`);

    const results = await page.evaluate(() => {
      const cards = document.querySelectorAll('salla-product-card, custom-salla-product-card, salla-products-list a, .product-block a, .product-card a');
      const cardDetails = Array.from(cards).map((c: any) => {
        return {
          tagName: c.tagName,
          className: c.className,
          href: c.href || c.querySelector('a')?.href || null,
          text: c.textContent?.trim().slice(0, 50) || null,
        };
      });
      return {
        cardCount: cards.length,
        cardDetails: cardDetails.slice(0, 10),
      };
    });

    console.log('--- Results from Playwright ---');
    console.log(`Card elements found: ${results.cardCount}`);
    console.log('Card details:', JSON.stringify(results.cardDetails, null, 2));

    // Let's print out all links on the page to see if there is any product link
    const allLinks = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a'))
        .map((a: any) => ({ href: a.href, text: a.textContent?.trim().slice(0, 30) }))
        .filter(l => l.href && (l.href.includes('/p') || l.href.includes('product')));
    });
    console.log(`Product-like links found on page: ${allLinks.length}`);
    console.log('Product links:', JSON.stringify(allLinks.slice(0, 20), null, 2));

  } catch (err: any) {
    console.error(`Playwright failed: ${err.message}`);
  } finally {
    await browser.close();
  }
}

testYasmin();
