import axios from 'axios';
import { getRandomUA } from '../src/ingestion/scraper/evasion';
import * as fs from 'fs';

async function run() {
  const url = 'https://mubarkiyah.com/search?c=73'; // Vegetables category
  console.log(`Fetching Mubarkiyah search page for ${url}...`);

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
      timeout: 15000,
    });
    const html = response.data;
    console.log(`HTML fetched successfully! Length: ${html.length}`);

    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (match) {
      console.log('🎉 Found __NEXT_DATA__!');
      const json = JSON.parse(match[1]);
      fs.writeFileSync('./scratch/mubarkiyah-category-next-data.json', JSON.stringify(json, null, 2));
      console.log('Saved to scratch/mubarkiyah-category-next-data.json');

      const pageProps = json.props?.pageProps;
      console.log('Keys of pageProps:', pageProps ? Object.keys(pageProps) : 'None');
      
      // Let's inspect potential keys
      if (pageProps) {
        for (const key of Object.keys(pageProps)) {
          if (Array.isArray(pageProps[key])) {
            console.log(`Array prop "${key}" length: ${pageProps[key].length}`);
            if (pageProps[key].length > 0) {
              console.log(`Sample from "${key}":`, Object.keys(pageProps[key][0]));
            }
          } else if (typeof pageProps[key] === 'object' && pageProps[key] !== null) {
            console.log(`Object prop "${key}" keys:`, Object.keys(pageProps[key]));
            if (pageProps[key].items) {
              console.log(`  "${key}.items" length:`, pageProps[key].items.length);
              if (pageProps[key].items.length > 0) {
                console.log(`  Sample from "${key}.items":`, Object.keys(pageProps[key].items[0]));
              }
            }
          }
        }
      }
    } else {
      console.log('❌ __NEXT_DATA__ not found.');
    }
  } catch (e: any) {
    console.error(`Failed: ${e.message}`);
  }
}

run();
