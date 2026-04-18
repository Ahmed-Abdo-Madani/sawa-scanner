import { chromium } from 'playwright';
import * as dotenv from 'dotenv';

dotenv.config();

async function openBullBoard() {
  const devSecret = process.env.DEV_ADMIN_SECRET || 'sawa-scanner-dev-2026';
  const port = process.env.PORT || 3000;
  const targetUrl = `http://localhost:${port}/admin/queues`;

  console.log(`[Admin] Initializing access to Bull Board at ${targetUrl}...`);
  console.log(`[Admin] Using development bypass (secret: ${devSecret})`);

  try {
    // 1. Launch browser with Playwright
    console.log(`[Admin] Launching browser with bypass headers...`);
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({
      extraHTTPHeaders: {
        'x-dev-admin-secret': devSecret,
      },
    });

    const page = await context.newPage();
    await page.goto(targetUrl);

    console.log(`[Admin] Bull Board is now open.`);
    console.log(
      `[Admin] Note: Do not close this terminal script to keep the browser open.`,
    );

    // Keep script running until browser is closed
    browser.on('disconnected', () => {
      console.log('[Admin] Browser closed. Exiting script.');
      process.exit(0);
    });
  } catch (error) {
    console.error(`\n[FATAL ERROR] Failed to open Bull Board:`);
    console.error(`- ${error.message}`);
    process.exit(1);
  }
}

openBullBoard();
