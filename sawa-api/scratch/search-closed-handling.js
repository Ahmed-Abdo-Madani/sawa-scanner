const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../src/ingestion/scraper/hungerstation-scraper.ts');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.toLowerCase().includes('closed') || line.toLowerCase().includes('close') || line.toLowerCase().includes('accept')) {
    console.log(`${i + 1}: ${line.trim()}`);
  }
}
