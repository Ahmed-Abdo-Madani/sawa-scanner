import axios from 'axios';
import { getRandomUA } from '../src/ingestion/scraper/evasion';

async function run() {
  const url = 'https://mubarkiyah.com/item/10042/%D8%A7%D9%84%D9%85%D8%B1%D8%A7%D8%B9%D9%8A%20%D8%AD%D9%84%D9%8A%D8%A8%202%20%D9%84%D8%AA%D8%B1&2';
  console.log(`Fetching Mubarkiyah detail HTML for ${url}...`);

  const ua = getRandomUA('desktop');
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
        'Referer': 'https://mubarkiyah.com/',
        'Connection': 'keep-alive',
      },
      timeout: 10000,
    });
    const html = response.data;
    console.log(`HTML fetched successfully! Length: ${html.length}`);

    // Let's print out lines containing "price" or "المراعي" or numbers
    const lines = html.split('\n');
    console.log('\n--- Searching for pricing patterns in HTML ---');
    for (const line of lines) {
      if (line.includes('price') || line.includes('Price') || line.includes('currency') || line.includes('SAR') || line.includes('ر.س')) {
        if (line.length < 500) {
          console.log(`Price match: ${line.trim()}`);
        } else {
          console.log(`Price match (truncated): ${line.substring(0, 300).trim()}...`);
        }
      }
    }

    // Let's look for numbers around 8 to 14 digits
    const barcodes = html.match(/\b\d{8,14}\b/g) || [];
    console.log('\n--- Barcodes / Numbers matching \\b\\d{8,14}\\b ---');
    console.log(barcodes);

  } catch (e: any) {
    console.error(`Failed to fetch Mubarkiyah HTML: ${e.message}`);
  }
}

run();
