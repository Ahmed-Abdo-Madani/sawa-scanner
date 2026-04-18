import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';
const devSecret = process.env.DEV_ADMIN_SECRET;
if (!devSecret) {
  console.error('❌ DEV_ADMIN_SECRET env var is not set. Aborting.');
  process.exit(1);
}

async function triggerHungerStationDiscovery() {
  console.log(
    '🚀 Triggering HungerStation discovery (mode=discover-cities)...',
  );
  console.log(`   API: ${API_BASE_URL}`);
  console.log(
    `   Pilot cities gate: ${process.env.HS_PILOT_CITIES ?? 'default (Riyadh)'}`,
  );

  try {
    const res = await axios.post(
      `${API_BASE_URL}/ingestion/jobs`,
      {
        platform: 'hungerstation',
        mode: 'discover-cities',
      },
      {
        headers: { 'x-dev-admin-secret': devSecret },
      },
    );
    const jobId = res.data?.jobId ?? res.data?.id ?? 'N/A';
    console.log(`✅  Discovery job enqueued — Job ID: ${jobId}`);
    console.log(
      `📊  Monitor progress on Bull Board: ${API_BASE_URL}/admin/queues`,
    );
  } catch (error: any) {
    console.error(
      `❌  Failed to enqueue: ${error.response?.data?.message ?? error.message}`,
    );
    process.exit(1);
  }
}

triggerHungerStationDiscovery();
