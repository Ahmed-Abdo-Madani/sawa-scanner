const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/ingestion/hs-catalog-scraper.service.ts');
if (!fs.existsSync(filePath)) {
  console.log(`File does not exist: ${filePath}`);
  return;
}
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log(`\nLines 200 to 276:`);
for (let j = 199; j <= 275; j++) {
  console.log(`${j + 1}: ${lines[j]}`);
}
