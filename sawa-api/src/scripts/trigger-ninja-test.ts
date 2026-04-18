import axios from 'axios';

const API_BASE_URL = 'http://localhost:3000';

const job = {
  platform: 'ninja',
  categoryUrl: 'https://ananinja.com/sa/en/category/fruits-and-vegetables-1011',
  pageRange: { start: 1, end: 1 },
};

async function triggerNinja() {
  console.log(`🚀 Triggering Ninja ingestion test: ${job.categoryUrl}...`);
  try {
    const res = await axios.post(`${API_BASE_URL}/ingestion/jobs`, job);
    console.log(`✅ Success! Job ID: ${res.data.id || 'N/A'}`);
  } catch (error: any) {
    console.error(
      `❌ Failed: ${error.response?.data?.message || error.message}`,
    );
  }
}

triggerNinja();
