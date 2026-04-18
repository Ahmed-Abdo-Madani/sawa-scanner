import { chromium } from 'playwright';
import axios from 'axios';

const testIds = [
  '19304468', // Zamani Cashwe Fingers
  '11614209', // Mentos Pure Fresh
  '4809', // Shams Sunflower Oil
  '7860', // Nadec Olive Oil
  '19294759', // Johnson's Baby Shampoo (Pharmacy)
];

async function verifyUrls() {
  console.log('--- Verifying Ninja URL Structure ---');

  for (const id of testIds) {
    const url = `https://ananinja.com/sa/en/product/${id}`;
    const pharmacyUrl = `https://ananinja.com/sa/en/pharmacy/product/${id}`;

    try {
      console.log(`Testing ID: ${id}`);
      // Try base URL
      const res = await axios.get(url, {
        maxRedirects: 5,
        validateStatus: () => true,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (res.status === 200 && !res.data.includes('Product not found')) {
        console.log(`✅ ${url} is working (Status ${res.status})`);
      } else {
        // Try pharmacy URL if base failed
        const resPharm = await axios.get(pharmacyUrl, {
          maxRedirects: 5,
          validateStatus: () => true,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });
        if (
          resPharm.status === 200 &&
          !resPharm.data.includes('Product not found')
        ) {
          console.log(
            `✅ ${pharmacyUrl} is working (Status ${resPharm.status})`,
          );
        } else {
          console.log(
            `❌ ${url} and ${pharmacyUrl} failed (Status ${res.status}/${resPharm.status})`,
          );
        }
      }
    } catch (err: any) {
      console.log(`❌ Error testing ${id}: ${err.message}`);
    }
  }
}

verifyUrls();
