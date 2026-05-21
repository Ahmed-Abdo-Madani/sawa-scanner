import axios from 'axios';
import { getRandomUA } from '../src/ingestion/scraper/evasion';
import * as fs from 'fs';

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
    fs.writeFileSync('scratch/parkcenter.html', response.data);
    console.log('HTML saved to scratch/parkcenter.html');
  } catch (err: any) {
    console.error(`Failed: ${err.message}`);
  }
}

test();
