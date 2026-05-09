import axios from 'axios';

async function triggerOffPriceLinking() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  // Extract explicit max products limit if provided
  const maxMatch = args.find((a) => a.startsWith('--max='));
  let maxProducts;
  if (maxMatch) {
    maxProducts = parseInt(maxMatch.split('=')[1], 10);
    if (isNaN(maxProducts)) {
      console.error('Invalid value for --max. Must be a number.');
      process.exit(1);
    }
  }

  // Extract explicit daily budget if provided
  const budgetMatch = args.find((a) => a.startsWith('--budget='));
  let dailyBudget;
  if (budgetMatch) {
    dailyBudget = parseInt(budgetMatch.split('=')[1], 10);
    if (isNaN(dailyBudget)) {
      console.error('Invalid value for --budget. Must be a number.');
      process.exit(1);
    }
  }

  // Extract explicit minimum confidence if provided
  const confMatch = args.find((a) => a.startsWith('--min-confidence='));
  let minConfidence;
  if (confMatch) {
    minConfidence = parseFloat(confMatch.split('=')[1]);
    if (isNaN(minConfidence)) {
      console.error('Invalid value for --min-confidence. Must be a number.');
      process.exit(1);
    }
  }

  const payload: any = {
    dryRun,
  };

  if (maxProducts !== undefined) payload.maxProducts = maxProducts;
  if (dailyBudget !== undefined) payload.dailyBudget = dailyBudget;
  if (minConfidence !== undefined) payload.minConfidence = minConfidence;

  console.log(`Triggering OFF Price Linking Pipeline...`);
  console.log(`Payload: ${JSON.stringify(payload, null, 2)}`);

  try {
    const response = await axios.post(
      'http://localhost:3000/ingestion/off-price-linking',
      payload,
      {
        headers: {
          'x-dev-admin-secret': process.env.DEV_ADMIN_SECRET || 'sawa-scanner-dev-2026',
        },
      }
    );
    console.log('Response:', response.data);
  } catch (error: any) {
    if (error.response) {
      console.error(
        `Failed with status ${error.response.status}:`,
        JSON.stringify(error.response.data, null, 2),
      );
    } else {
      console.error('Request failed:', error.message);
    }
    process.exit(1);
  }
}

triggerOffPriceLinking();
