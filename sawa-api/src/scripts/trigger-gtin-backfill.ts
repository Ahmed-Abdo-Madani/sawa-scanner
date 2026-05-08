import axios from 'axios';
import * as dotenv from 'dotenv';
dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const devSecret = process.env.DEV_ADMIN_SECRET || 'sawa-scanner-dev-2026';

async function triggerGtinBackfill() {
  console.log('🚀 Triggering GTIN Backfill...');

  // Parse command-line arguments
  const args = process.argv.slice(2);
  const parsedFlags: any = {
    enableAiMatch: false,
    enableEmbeddingMatch: false,
    rebuildAiCache: false,
    rebuildEmbeddingCache: false,
    embeddingOnly: false,
    dryRun: true, // Comment 2: safer default (dry-run-first)
    rebuildPool: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--ai') {
      parsedFlags.enableAiMatch = true;
    } else if (arg === '--rebuild-ai-cache') {
      parsedFlags.rebuildAiCache = true;
    // ── GTIN Embedding Match (Pass G) ──
    } else if (arg === '--embedding') {
      parsedFlags.enableEmbeddingMatch = true;
      // --embedding without --embedding-only also enables AI to pass embedding candidates to verifier
      if (!parsedFlags.embeddingOnly) {
        parsedFlags.enableAiMatch = true;
      }
    } else if (arg === '--no-embedding') {
      parsedFlags.enableEmbeddingMatch = false;
    } else if (arg === '--rebuild-embedding-cache') {
      parsedFlags.rebuildEmbeddingCache = true;
    } else if (arg === '--embedding-only') {
      parsedFlags.embeddingOnly = true;
      parsedFlags.enableEmbeddingMatch = true;
      parsedFlags.enableAiMatch = false;
    // Comment 1: New flags for maxOffProducts control
    } else if (arg === '--max-off-products' && i + 1 < args.length) {
      parsedFlags.maxOffProducts = parseInt(args[i + 1], 10);
      i++;
    } else if (arg.startsWith('--max-off-products=')) {
      parsedFlags.maxOffProducts = parseInt(arg.split('=')[1], 10);
    } else if (arg === '--no-max-off-products') {
      delete parsedFlags.maxOffProducts;
    // Comment 2: New flags for dry-run control
    } else if (arg === '--dry-run') {
      parsedFlags.dryRun = true;
    } else if (arg === '--no-dry-run') {
      parsedFlags.dryRun = false;
    // Comment 2: Flag to rebuild the OFF pool
    } else if (arg === '--rebuild-pool') {
      parsedFlags.rebuildPool = true;
    // Comment 2: Flag to omit maxProducts (use full scan set)
    } else if (arg === '--no-max-products') {
      delete parsedFlags.maxProducts;
    } else if (arg === '--max-products' && i + 1 < args.length) {
      parsedFlags.maxProducts = parseInt(args[i + 1], 10);
      i++;
    } else if (arg.startsWith('--max-products=')) {
      parsedFlags.maxProducts = parseInt(arg.split('=')[1], 10);
    // ── AI Verdict Cache Isolation ──
    } else if (arg === '--ignore-ai-verdict-cache') {
      parsedFlags.ignoreAiVerdictCache = true;
    } else if (arg === '--rebuild-ai-cache-isolated') {
      parsedFlags.rebuildAiCache = true;
      parsedFlags.aiVerdictProviderIsolation = true;
    }
  }

  try {
    const payload = {
      mode: 'gtin-backfill-off', // Explicitly set mode
      useDump: true,
      ...parsedFlags,
    };

    console.log('Parsed flags:', JSON.stringify(parsedFlags, null, 2));
    const aiProvider = process.env.GTIN_AI_PROVIDER || 'google';
    const embeddingProvider = process.env.GTIN_EMBEDDING_PROVIDER || 'google';
    console.log(`Providers: matching=${aiProvider}, embedding=${embeddingProvider}`);
    console.log('Payload:', JSON.stringify(payload, null, 2));
    
    const res = await axios.post(
      `${API_BASE_URL}/ingestion/backfill-gtins`,
      payload,
      {
        headers: {
          'x-dev-admin-secret': devSecret,
        },
        // Comment 3: Handle 409 status as a valid response for duplicate job detection
        validateStatus: (status) => (status >= 200 && status < 300) || status === 409,
      }
    );
    
    // Check if the job was actually created or if there was a conflict
    const { jobId, created, message } = res.data;
    
    if (res.status === 409 || !created) {
      console.warn('⚠️  GTIN backfill not queued (conflict):');
      console.warn('Message:', message || 'A backfill is already in progress.');
      process.exit(0);
    }
    
    console.log('✅ Backfill job triggered successfully!');
    console.log('Job ID:', jobId);
    console.log('Status:', message || 'Job queued.');
    console.log('Full response:', JSON.stringify(res.data, null, 2));
    console.log('\n📊 Monitor the Bull Board at http://localhost:3000/admin/queues to track progress.');
  } catch (error: any) {
    console.error('❌ Failed to trigger GTIN backfill:');
    console.error(
      'Error:',
      error.response?.data?.message || error.message
    );
    if (error.response?.status === 401 || error.response?.status === 403) {
      console.error('ℹ️  Authentication failed. Check DEV_ADMIN_SECRET in .env');
    }
    process.exit(1);
  }
}

triggerGtinBackfill();
