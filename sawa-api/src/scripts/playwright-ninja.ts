import { chromium } from 'playwright';

async function test() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  await page.goto('https://ananinja.com/sa/en/category/dairy-eggs', {
    waitUntil: 'networkidle',
  });

  const scripts = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('script')).map(
      (s) => s.textContent || '',
    );
  });

  console.log(`Found ${scripts.length} scripts.`);

  let totalMatches = 0;
  for (const content of scripts) {
    if (content.includes('self.__next_f.push')) {
      const regexNextF = /self\.__next_f\.push\(\[\d+,\s*"(.*?)"\]\)/g;
      let match;
      while ((match = regexNextF.exec(content)) !== null) {
        try {
          const unescaped = match[1]
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\')
            .replace(/\\n/g, '');
          const jsons = findJSONObjects(unescaped, '"productId"');
          if (jsons.length > 0) {
            totalMatches += jsons.length;
            console.log('Found JSONs:', jsons.length);
            console.dir(jsons[0], { depth: 2 });
          }
        } catch (e) {}
      }
    }
  }

  console.log(`Total __next_f product objects found: ${totalMatches}`);

  await browser.close();
}

function findJSONObjects(text: string, marker: string): any[] {
  const results: any[] = [];
  let searchIndex = 0;
  while ((searchIndex = text.indexOf(marker, searchIndex)) !== -1) {
    const openBraceIndex = text.lastIndexOf('{', searchIndex);
    if (openBraceIndex === -1) {
      searchIndex++;
      continue;
    }
    let braceCount = 0;
    let inString = false;
    let isEscaped = false;
    let closedIndex = -1;

    for (let i = openBraceIndex; i < text.length; i++) {
      const char = text[i];
      if (inString) {
        if (char === '\\') {
          isEscaped = !isEscaped;
        } else if (char === '"' && !isEscaped) {
          inString = false;
        } else {
          isEscaped = false;
        }
      } else {
        if (char === '"') {
          inString = true;
        } else if (char === '{') {
          braceCount++;
        } else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            closedIndex = i;
            break;
          }
        }
      }
    }

    if (closedIndex !== -1) {
      const potentialJson = text.substring(openBraceIndex, closedIndex + 1);
      try {
        results.push(JSON.parse(potentialJson));
      } catch (e) {}
    }
    searchIndex += marker.length;
  }
  return results;
}

test().catch(console.error);
