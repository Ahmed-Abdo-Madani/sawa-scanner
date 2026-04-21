const http = require('https');
const fs = require('fs');
const path = require('path');

const TESSDATA_DIR = path.join(__dirname, '..', 'tessdata');
const URLS = [
  { url: 'https://github.com/tesseract-ocr/tessdata_best/raw/main/eng.traineddata', name: 'eng.traineddata' },
  { url: 'https://github.com/tesseract-ocr/tessdata_best/raw/main/ara.traineddata', name: 'ara.traineddata' }
];

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    http.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function main() {
  if (!fs.existsSync(TESSDATA_DIR)) {
    fs.mkdirSync(TESSDATA_DIR, { recursive: true });
  }

  console.log('Downloading tesseract.js language data...');
  
  for (const item of URLS) {
    const dest = path.join(TESSDATA_DIR, item.name);
    if (fs.existsSync(dest)) {
      console.log(`Skipping ${item.name} - already downloaded`);
      continue;
    }
    
    console.log(`Downloading ${item.name}...`);
    try {
      await downloadFile(item.url, dest);
      console.log(`Downloaded ${item.name} successfully`);
    } catch (e) {
      console.error(`Failed to download ${item.name}:`, e);
      process.exit(1);
    }
  }
  
  console.log('Tessdata downloaded to', TESSDATA_DIR);
}

main();
