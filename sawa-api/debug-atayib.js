async function debugStore(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    const html = await response.text();
    console.log(`=== URL: ${url} ===`);
    console.log('Is Salla CSS present:', html.includes('salla-') || html.includes('s-button'));
    console.log('Is Zid CSS present:', html.includes('zid-') || html.includes('zid_'));
    console.log('Meta elements:', html.match(/<meta[^>]*>/gi)?.slice(0, 10));
    console.log('Link tags:', html.match(/<link[^>]*>/gi)?.slice(0, 10));
    console.log('Script tags:', html.match(/<script[^>]*>/gi)?.slice(0, 10));
  } catch (e) {
    console.log(`Failed to fetch ${url}: ${e.message}`);
  }
}

async function run() {
  await debugStore('https://www.atayib.com');
  await debugStore('https://mubarkiyah.com');
}
run();
