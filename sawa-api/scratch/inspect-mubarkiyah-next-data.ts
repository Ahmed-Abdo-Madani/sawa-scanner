import axios from 'axios';
import { getRandomUA } from '../src/ingestion/scraper/evasion';

async function run() {
  const url = 'https://mubarkiyah.com/item/10042/%D8%A7%D9%84%D9%85%D8%B1%D8%A7%D8%B9%D9%8A%20%D8%AD%D9%84%D9%8A%D8%A8%202%20%D9%84%D8%AA%D8%B1&2';
  const ua = getRandomUA('desktop');
  try {
    const response = await axios.get(url, {
      headers: {
        'User-Agent': ua,
        'Referer': 'https://mubarkiyah.com/',
      },
    });
    const html = response.data;
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (match) {
      console.log('🎉 Found __NEXT_DATA__ script!');
      const json = JSON.parse(match[1]);
      // Let's write the JSON to a file so we can view it
      const fs = require('fs');
      fs.writeFileSync('./scratch/mubarkiyah-next-data.json', JSON.stringify(json, null, 2));
      console.log('Saved to scratch/mubarkiyah-next-data.json');

      // Let's inspect some common paths in Next.js props
      const pageProps = json.props?.pageProps;
      console.log('Keys of pageProps:', pageProps ? Object.keys(pageProps) : 'None');
      if (pageProps?.item) {
        console.log('Found item object:', pageProps.item);
      } else if (pageProps?.dehydratedState) {
        console.log('Found dehydratedState query keys:', pageProps.dehydratedState.queries?.map((q: any) => q.queryKey));
        // Let's print some query data
        for (const query of pageProps.dehydratedState.queries || []) {
          const data = query.state?.data;
          if (data) {
            console.log(`Query ${query.queryKey.join('/')} data properties:`, Object.keys(data));
            if (data.item || data.product) {
              console.log('Found item/product in query state:', data.item || data.product);
            }
          }
        }
      }
    } else {
      console.log('❌ __NEXT_DATA__ not found.');
    }
  } catch (e: any) {
    console.error(`Error: ${e.message}`);
  }
}

run();
