import * as fs from 'fs';

function inspect() {
  const html = fs.readFileSync('salla-search.html', 'utf-8');

  // Let's print out all occurrences of script type="application/ld+json"
  const matches = html.match(/<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
  console.log(`Found ${matches ? matches.length : 0} ld+json script blocks.`);
  if (matches) {
    matches.forEach((m, i) => {
      console.log(`\nBlock [${i + 1}]:`);
      console.log(m.slice(0, 500));
    });
  }

  // Let's search for "6281057030040" in the HTML
  const barcodeIndex = html.indexOf('6281057030040');
  console.log(`Index of '6281057030040': ${barcodeIndex}`);
  if (barcodeIndex !== -1) {
    console.log('Surrounding text of barcode:');
    console.log(html.slice(Math.max(0, barcodeIndex - 100), Math.min(html.length, barcodeIndex + 200)));
  }

  // Let's search for some product elements. Let's find any URLs that contain "/p/" or "/product/"
  const productUrls = html.match(/\/p\/[^\s"'>]+/g);
  console.log(`Found ${productUrls ? productUrls.length : 0} product URLs (/p/...)`);
  if (productUrls) {
    console.log('First 10 product URLs:', productUrls.slice(0, 10));
  }

  // Let's check for any Salla JSON lists
  const sallaState = html.match(/window\.\w+\s*=/);
  if (sallaState) {
    console.log('Found window variables:', html.match(/window\.\w+/g));
  }
}

inspect();
