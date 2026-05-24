import axios from 'axios';
import { getRandomUA } from '../src/ingestion/scraper/evasion';

async function run() {
  const url = 'https://mo0o0nat.com/products?q=6291003011856';
  const ua = getRandomUA('desktop');
  try {
    console.log(`Fetching HTML from: ${url}...`);
    const response = await axios.get(url, {
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ar,en-US;q=0.9,en;q=0.8',
      }
    });
    const html = response.data;
    console.log(`HTML size: ${html.length}`);

    // Let's find all script tags
    const scriptMatches = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) || [];
    console.log(`Found ${scriptMatches.length} script tags in HTML.`);

    for (let i = 0; i < scriptMatches.length; i++) {
      const script = scriptMatches[i];
      // Check if it contains some keywords like authorization, api, store, or zid
      const content = script.replace(/<script\b[^>]*>/i, '').replace(/<\/script>/i, '').trim();
      if (content.length > 0) {
        console.log(`\n--- Script ${i + 1} (length: ${content.length}) ---`);
        if (content.length < 500) {
          console.log(content);
        } else {
          console.log(content.substring(0, 300) + '... [TRUNCATED]');
        }
      }
    }
  } catch (e: any) {
    console.error(`Error: ${e.message}`);
  }
}

run();
