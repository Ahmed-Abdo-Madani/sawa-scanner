/**
 * Brute-force JSON-object extractor used by hydration sweeps.
 *
 * Scans `text` for every occurrence of `marker` and walks backwards to find
 * the smallest enclosing `{…}` that is valid JSON. Duplicate containment is
 * avoided because we break as soon as the first valid enclosure is found.
 */
export function findJSONObjects(text: string, marker: string): any[] {
  const results: any[] = [];
  let searchIndex = 0;

  while ((searchIndex = text.indexOf(marker, searchIndex)) !== -1) {
    let pos = searchIndex;

    // Search backwards for potential starting braces
    while (pos >= 0) {
      pos = text.lastIndexOf('{', pos);
      if (pos === -1) break;

      let braceCount = 0;
      let inString = false;
      let isEscaped = false;
      let closedIndex = -1;

      for (let i = pos; i < text.length; i++) {
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

      if (closedIndex !== -1 && closedIndex >= searchIndex) {
        const potentialJson = text.substring(pos, closedIndex + 1);
        try {
          const parsed = JSON.parse(potentialJson);
          results.push(parsed);
          break; // Found the immediate containing object; move to next marker occurrence
        } catch (_) {
          /* not valid JSON at this bracket level — try a wider one */
        }
      }
      pos--; // Move before this '{' to look for a parent
    }

    searchIndex += marker.length;
  }
  return results;
}

/**
 * Decodes a Next.js RSC (React Server Component) stream from a script block.
 * Handles escaping and Unicode sequences using JSON.parse for robustness.
 */
export function decodeRscStream(text: string): any[] {
  const chunks: string[] = [];
  const regexNextF = /self\.__next_f\.push\(\[\d+,\s*"(?<content>(?:[^"\\]|\\.)*)"\]\)/gs;
  let match: RegExpExecArray | null;

  while ((match = regexNextF.exec(text)) !== null) {
    try {
      const rawEncoded = (match.groups as any).content as string;
      // Using JSON.parse to correctly handle all escape sequences including Unicode
      const decoded = JSON.parse('"' + rawEncoded + '"');
      chunks.push(decoded);
    } catch (_) {
      /* skip malformed chunk */
    }
  }

  const fullStream = chunks.join('');
  return [
    ...findJSONObjects(fullStream, '"slug"'),
    ...findJSONObjects(fullStream, '"name_en"'),
    ...findJSONObjects(fullStream, '"nameEn"'),
  ];
}

/**
 * Normalizes HungerStation merchant names by stripping delivery time estimations,
 * repeated suffix words (DOM artifact), and common Arabic chain prefixes.
 * Examples:
 *   "Al Othaim25 - 40mins"       → "Othaim"
 *   "Evey BakeryBakery"          → "Evey Bakery"
 *   "Alshanawani RoasteryRoastery"→ "Alshanawani Roastery"
 */
export function normalizeHsMerchantName(rawName: string): string {
  if (!rawName) return '';
  let name = rawName.trim();

  // 1. Strip HungerStation delivery estimations (e.g., "25 - 40mins" or "10-20mins")
  name = name.replace(/\d*\s*-?\s*\d+\s*mins.*$/i, '').trim();

  // 2. Collapse consecutive duplicate words (e.g., "BakeryBakery" from DOM text concat)
  //    CamelCase-split: insert a space before an uppercase letter that follows a lowercase letter,
  //    then deduplicate adjacent identical words (case-insensitive).
  name = name.replace(/([a-z])([A-Z])/g, '$1 $2'); // "BakeryBakery" → "Bakery Bakery"
  name = name.replace(/\b(\w+)\s+\1\b/gi, '$1');  // "Bakery Bakery" → "Bakery"
  name = name.replace(/\s{2,}/g, ' ').trim();

  // 3. Strip "Al " prefix common in Saudi chain names if present
  if (name.toLowerCase().startsWith('al ')) {
    name = name.substring(3).trim();
  }

  // 4. Known chain aliases/overrides (applied AFTER prefix stripping)
  const lower = name.toLowerCase();
  if (lower.includes('othaim')) return 'Othaim';
  if (lower.includes('panda')) return 'Panda';
  if (lower.includes('carrefour')) return 'Carrefour';
  if (lower.includes('tamimi')) return 'Tamimi';
  if (lower.includes('ninja')) return 'Ninja';
  if (lower.includes('spinneys')) return 'Spinneys';
  if (lower.includes('circle k') || lower === 'circlek') return 'Circle K';

  return name;
}
