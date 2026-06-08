const fs = require('fs');
const path = require('path');

const file1 = path.join(__dirname, '../src/ingestion/hs-catalog-scraper.service.ts');
const file2 = path.join(__dirname, '../src/ingestion/scraper/hungerstation-scraper.ts');

const findInFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('extractHsProductId')) {
      console.log(`${path.basename(filePath)}:${i+1}: ${lines[i]}`);
    }
  }
};

findInFile(file1);
findInFile(file2);
