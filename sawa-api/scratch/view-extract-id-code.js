const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/ingestion/hs-catalog-scraper.service.ts');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

for (let j = 15; j < 35; j++) {
  console.log(`${j + 1}: ${lines[j]}`);
}
