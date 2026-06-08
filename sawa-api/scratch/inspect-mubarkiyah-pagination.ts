import axios from 'axios';
import { getRandomUA } from '../src/ingestion/scraper/evasion';

async function run() {
  const url = 'https://mubarkiyah.com/search?c=73&page=2'; // Vegetables category page 2
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
      const itemsData = json.props?.pageProps?.itemsData;
      if (itemsData) {
        console.log(`currentPage: ${itemsData.currentPage}`);
        console.log(`totalPages: ${itemsData.totalPages}`);
        console.log(`totalItems: ${itemsData.totalItems}`);
        console.log(`list length: ${itemsData.list?.length}`);
        if (itemsData.list && itemsData.list.length > 0) {
          console.log('Sample product from page 2:', {
            descAr: itemsData.list[0].descAr,
            priceWithVat: itemsData.list[0].priceWithVat,
            barcode: itemsData.list[0].barcode,
            itemId: itemsData.list[0].itemId
          });
        }
      } else {
        console.log('❌ itemsData not found in pageProps.');
      }
    } else {
      console.log('❌ __NEXT_DATA__ not found.');
    }
  } catch (e: any) {
    console.error(`Failed: ${e.message}`);
  }
}

run();
