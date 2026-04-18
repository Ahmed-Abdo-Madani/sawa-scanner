import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

const API_BASE_URL = 'http://localhost:3000';
const devSecret = process.env.DEV_ADMIN_SECRET || 'sawa-scanner-dev-2026';

const categories = [
  // Ninja Leaf Category (immediate products)
  {
    platform: 'ninja',
    categoryUrl: 'https://ananinja.com/sa/en/category/dairy-eggs',
    pageRange: { start: 1, end: 1 },
  },
];

async function triggerJobs() {
  console.log(
    `🚀 Starting Ninja-only wave of ${categories.length} ingestion jobs...`,
  );

  for (const cat of categories) {
    try {
      console.log(
        `Triggering ${cat.platform}: ${cat.categoryUrl} (Pages ${cat.pageRange.start}-${cat.pageRange.end})...`,
      );
      const res = await axios.post(`${API_BASE_URL}/ingestion/jobs`, cat, {
        headers: {
          'x-dev-admin-secret': devSecret,
        },
      });
      console.log(`✅ Success! Job ID: ${res.data.id || 'N/A'}`);
    } catch (error: any) {
      console.error(
        `❌ Failed ${cat.platform}: ${error.response?.data?.message || error.message}`,
      );
    }
  }

  console.log('\n✨ Ninja jobs triggered. Monitor progress on the Bull Board.');
}

triggerJobs();
