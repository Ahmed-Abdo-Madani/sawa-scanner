import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

const API_BASE_URL = 'http://localhost:3000';
const devSecret = process.env.DEV_ADMIN_SECRET || 'sawa-scanner-dev-2026';

const departments = [
  'milk-dairy',
  'pharmacy',
  'supermarket',
  'snacks',
  'fruits-vegetables',
  'meat-poultry',
  'bakery',
  'frozen',
  'pantry',
  'beverages',
  'baby-care',
  'personal-care',
  'home-care',
  'pet-care'
];

async function triggerRootJobs() {
  console.log(`🚀 Starting Global Ninja Ingestion for ${departments.length} departments...`);
  
  for (const dept of departments) {
    const categoryUrl = `https://ananinja.com/sa/en/category/${dept}`;
    const payload = {
      platform: 'ninja',
      categoryUrl,
      pageRange: { start: 1, end: 20 },
      depth: 0
    };

    try {
      console.log(`Triggering ${dept}...`);
      const res = await axios.post(`${API_BASE_URL}/ingestion/jobs`, payload, {
        headers: {
          'x-dev-admin-secret': devSecret
        }
      });
      console.log(`✅ Success! Job ID: ${res.data.id || 'N/A'}`);
    } catch (error: any) {
      console.error(`❌ Failed ${dept}: ${error.response?.data?.message || error.message}`);
    }
  }
  
  console.log('\n✨ All root jobs triggered. Recursion will handle subcategories.');
}

triggerRootJobs();
