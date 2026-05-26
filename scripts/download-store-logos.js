const fs = require('fs');
const path = require('path');
const https = require('https');

const stores = [
  { url: 'https://store.shonaksa.com', name: 'shonaksa' },
  { url: 'https://yasminstore.com', name: 'yasmin_store' },
  { url: 'https://mrlogman.com', name: 'mr_logman' },
  { url: 'https://etaamexpress.com', name: 'etaam_express' },
  { url: 'https://parkcentersa.com', name: 'park_center' },
  { url: 'https://menhal.sa', name: 'menhal' },
  { url: 'https://hsd-sh.com', name: 'hsd_sh' },
  { url: 'https://nwsha.com', name: 'nwsha' },
  { url: 'https://alaqialmarkets.net', name: 'alaqial_markets' },
  { url: 'https://shaml.sa', name: 'shaml' },
  { url: 'https://aliaqtisadia.sa', name: 'aliaqtisadia' },
  { url: 'https://mo3en.com', name: 'mo3en' },
  { url: 'https://mo0o0nat.com', name: 'mo0o0nat' },
  { url: 'https://narjs.store', name: 'narjs_store' },
  { url: 'https://talbatuk.com', name: 'talbatuk' },
  { url: 'https://dukanexpress.com', name: 'dukan_express' },
  { url: 'https://eanaab.com', name: 'eanaab' },
  { url: 'https://www.atayib.com', name: 'atayib' },
  { url: 'https://mubarkiyah.com', name: 'mubarkiyah' }
];

const destDir = path.join(__dirname, '..', 'sawa_app', 'assets', 'images');
if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

function download(url, filename) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        // follow redirect
        const redirectUrl = res.headers.location;
        download(redirectUrl, filename).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: status code ${res.statusCode}`));
        return;
      }
      const fileStream = fs.createWriteStream(filename);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close();
        resolve();
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

async function run() {
  for (const store of stores) {
    try {
      const hostname = new URL(store.url).hostname;
      const faviconUrl = `https://www.google.com/s2/favicons?sz=128&domain=${hostname}`;
      const destPath = path.join(destDir, `${store.name}.png`);
      console.log(`Downloading favicon for ${store.name} from ${faviconUrl}...`);
      await download(faviconUrl, destPath);
      console.log(`Saved to ${destPath}`);
    } catch (e) {
      console.error(`Error downloading for ${store.name}:`, e.message);
    }
  }
}

run();
