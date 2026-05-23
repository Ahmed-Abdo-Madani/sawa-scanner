import * as fs from 'fs';

function searchAr() {
  const html = fs.readFileSync('salla-search.html', 'utf-8');

  // Let's remove tags and print text lines containing interesting search terms
  const cleanText = html.replace(/<[^>]*>/g, '\n').split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  console.log('--- Interesting lines in Salla search page ---');
  for (const line of cleanText) {
    if (line.includes('بحث') || line.includes('نتائج') || line.includes('وجد') || line.includes('عذر') || line.includes('منتج') || line.includes('عثور') || line.includes('سلة') || line.includes('بضائع')) {
      console.log(`> ${line}`);
    }
  }
}

searchAr();
