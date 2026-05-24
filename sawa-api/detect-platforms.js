const domains = [
  'https://www.atayib.com',
  'https://mubarkiyah.com',
  'https://hsd-sh.com',
  'https://nwsha.com',
  'https://alaqialmarkets.net',
  'https://shaml.sa',
  'https://aliaqtisadia.sa',
  'https://mo3en.com',
  'https://mo0o0nat.com',
  'https://narjs.store',
  'https://talbatuk.com',
  'https://waw.sa',
  'https://dukanexpress.com',
  'https://eanaab.com',
];

async function detect(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    const html = await response.text();
    let platform = 'unknown';

    if (html.includes('salla.sa') || html.includes('cdn.salla.network') || html.includes('salla-') || html.includes('window.Salla')) {
      platform = 'salla';
    } else if (html.includes('zid.sa') || html.includes('window.__INITIAL_STATE__') || html.includes('zid-') || html.includes('ZidStorefront')) {
      platform = 'zid';
    } else if (html.includes('drupal') || html.includes('/search/node/')) {
      platform = 'drupal';
    } else if (html.includes('woocommerce') || html.includes('wp-content')) {
      platform = 'woocommerce';
    }

    console.log(`[Platform Detect] ${url} -> ${platform}`);
  } catch (e) {
    console.log(`[Platform Detect] ${url} -> FAILED: ${e.message}`);
  }
}

async function run() {
  for (const domain of domains) {
    await detect(domain);
  }
}

run();
