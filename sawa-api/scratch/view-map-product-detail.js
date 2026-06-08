const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/ingestion/scraper/hungerstation-scraper.ts');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

console.log(`\nLines 900 to 960:`);
for (let j = 899; j <= 959; j++) {
  console.log(`${j + 1}: ${lines[j]}`);
}
