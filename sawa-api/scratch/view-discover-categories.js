const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/ingestion/scraper/hungerstation-scraper.ts');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log(`\nLines 460 to 530:`);
for (let j = 459; j <= 529; j++) {
  console.log(`${j + 1}: ${lines[j]}`);
}
