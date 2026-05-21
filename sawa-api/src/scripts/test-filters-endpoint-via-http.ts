import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const devSecret = process.env.DEV_ADMIN_SECRET || 'sawa-scanner-dev-2026';

async function testFilters() {
  console.log('🚀 Fetching filters from:', `${API_BASE_URL}/admin/products/filters-meta`);
  try {
    const res = await axios.get(
      `${API_BASE_URL}/admin/products/filters-meta`,
      {
        headers: {
          'x-dev-admin-secret': devSecret,
        },
      }
    );
    console.log('✅ Response Status:', res.status);
    console.log('✅ Response Data:', JSON.stringify(res.data, null, 2));
  } catch (error: any) {
    console.error('❌ Failed to fetch filters:');
    console.error('Error:', error.response?.data?.message || error.message);
  }
}

testFilters();
