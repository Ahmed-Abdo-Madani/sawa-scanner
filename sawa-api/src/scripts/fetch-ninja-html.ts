import axios from 'axios';
import * as fs from 'fs';

async function test() {
  try {
    const res = await axios.get('https://ananinja.com/sa/en/category/fruits-and-vegetables-1011', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });

    fs.writeFileSync('C:/Users/Design_Bench_12/.gemini/antigravity/brain/910d92a9-7e36-45e5-9843-af2749d98c2a/scratch/ninja-category.html', res.data);
    console.log('HTML saved.');
  } catch (err) {
    console.error('Error fetching HTML:', err.message);
  }
}

test();
