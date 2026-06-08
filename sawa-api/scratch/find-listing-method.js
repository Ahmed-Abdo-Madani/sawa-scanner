const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/ingestion/scraper/hungerstation-scraper.ts');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

let foundIndex = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('scrapeListingPage')) {
    console.log(`Found scrapeListingPage on line ${i + 1}: ${lines[i]}`);
    foundIndex = i;
  }
}

if (foundIndex !== -1) {
  const start = Math.max(0, foundIndex - 20);
  const end = Math.min(lines.length - 1, foundIndex + 100);
  console.log(`\nLines ${start + 1} to ${end + 1}:`);
  for (let j = start; j <= end; j++) {
    console.log(`${j + 1}: ${lines[j]}`);
  }
}
