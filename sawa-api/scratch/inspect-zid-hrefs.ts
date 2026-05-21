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

    // Check if the word "شاي" (tea) is in the HTML
    const teaIndex = html.indexOf('شاي');
    console.log(`Index of 'شاي': ${teaIndex}`);
    if (teaIndex !== -1) {
      console.log(`Snippet around 'شاي':\n${html.substring(teaIndex - 100, teaIndex + 300)}`);
    }

    // Let's print any href links
    const hrefs = html.match(/href="([^"]*)"/gi) || [];
    console.log(`Total href links found: ${hrefs.length}`);
    const uniqueHrefs = Array.from(new Set(hrefs));
    console.log(`Unique hrefs (first 30):`);
    console.log(uniqueHrefs.slice(0, 30));

  } catch (err: any) {
    console.error(`Failed: ${err.message}`);
  }
}

test();
