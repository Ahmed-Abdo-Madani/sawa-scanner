import { diceCoefficient } from '../src/utils/string-similarity';

const BRAND_GUARD_STOPWORDS_AR = new Set([
  // Colors (Arabic)
  'أصفر', 'أحمر', 'أخضر', 'أزرق', 'أبيض', 'أسود', 'ذهبي', 'بني', 'برتقالي',
  'وردي', 'بنفسجي', 'رمادي', 'فضي',
  // Generic adjectives (Arabic)
  'كلاسيكي', 'كلاسيك', 'أصلي', 'ممتاز', 'طازج', 'نقي', 'طبيعي', 'عضوي',
  'خفيف', 'لايت', 'إكسترا', 'سوبر', 'ميني', 'كبير', 'صغير',
  'جديد', 'قديم', 'تقليدي', 'خاص', 'عادي', 'كامل', 'منزوع', 'قليل',
  'دسم', 'خالي', 'سكر', 'زيرو', 'دايت', 'عالي', 'غني', 'ناعم', 'مقرمش',
  'فاخر', 'مختار', 'أفضل',
  // Arabic articles / connectors
  'ال', 'من', 'مع', 'في', 'بنكهة', 'نكهة', 'طعم',
  // Food category words (Arabic)
  'حليب', 'عصير', 'ماء', 'زيت', 'جبن', 'جبنة', 'زبدة', 'كريم', 'كريمة', 'خبز',
  'دجاج', 'لحم', 'سمك', 'أرز', 'رز', 'طحين', 'ملح', 'سكر', 'عسل',
  'موز', 'تفاح', 'مانجو', 'تمر', 'تمور', 'طماطم', 'بطاطس', 'بصل',
  'بيض', 'زبادي', 'لبن', 'سمن', 'شوكولاتة', 'شوكولا', 'قهوة',
  'شاي', 'بسكويت', 'كيك', 'شيبس', 'سناك', 'حلوى', 'علكة',
  'معجون', 'صلصة', 'معكرونة', 'مكرونة', 'فول', 'حمص', 'فاصوليا',
  // Generic packaging / format words
  'علبة', 'كيس', 'عبوة', 'قطعة', 'حبة', 'قطع', 'حبات', 'جرام', 'غرام',
  'مل', 'لتر', 'كغ', 'كيلو',
]);

function normalizeArabic(text: string): string {
  return text
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ـ/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSizes(text: string): Array<{ normalized: number; dim: 'vol' | 'mass' }> {
  const sizes: Array<{ normalized: number; dim: 'vol' | 'mass' }> = [];

  // Latin units
  const reLatin = /(?:\d+[x×])?([\d]+(?:[.,]\d+)?)\s*(ml|l|g|kg|oz)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = reLatin.exec(text)) !== null) {
    const val = parseFloat(m[1].replace(',', '.'));
    const unit = m[2].toLowerCase();
    if (unit === 'ml') sizes.push({ normalized: val, dim: 'vol' });
    else if (unit === 'oz') sizes.push({ normalized: val * 29.574, dim: 'vol' });
    else if (unit === 'l') sizes.push({ normalized: val * 1000, dim: 'vol' });
    else if (unit === 'g') sizes.push({ normalized: val, dim: 'mass' });
    else if (unit === 'kg') sizes.push({ normalized: val * 1000, dim: 'mass' });
  }

  // Arabic units
  const reArabic = /(?:\d+[x×])?([\d]+(?:[.,]\d+)?)\s*(مل|ملل|لتر|جرام|غرام|غ|جم|كجم|كغ|كيلو|كيلوجرام|كيلوغرام)(?![a-zA-Z0-9\u0600-\u06FF])/g;
  while ((m = reArabic.exec(text)) !== null) {
    const val = parseFloat(m[1].replace(',', '.'));
    const unit = m[2];
    if (['مل', 'ملل'].includes(unit)) {
      sizes.push({ normalized: val, dim: 'vol' });
    } else if (unit === 'لتر') {
      sizes.push({ normalized: val * 1000, dim: 'vol' });
    } else if (['جرام', 'غرام', 'غ', 'جم'].includes(unit)) {
      sizes.push({ normalized: val, dim: 'mass' });
    } else if (['كجم', 'كغ', 'كيلو', 'كيلوجرام', 'كيلوغرام'].includes(unit)) {
      sizes.push({ normalized: val * 1000, dim: 'mass' });
    }
  }

  return sizes;
}

function sizeGuardPasses(query: string, candidate: string): boolean {
  const qSizes = extractSizes(query);
  const cSizes = extractSizes(candidate);
  console.log('  Query Extracted Sizes:', qSizes);
  console.log('  Candidate Extracted Sizes:', cSizes);

  for (const dim of ['vol', 'mass'] as const) {
    const qVals = qSizes.filter((s) => s.dim === dim).map((s) => s.normalized);
    const cVals = cSizes.filter((s) => s.dim === dim).map((s) => s.normalized);

    if (qVals.length === 0 || cVals.length === 0) continue;

    const qUnit = Math.min(...qVals);
    const cUnit = Math.min(...cVals);

    const tolerance = 0.10;
    const diff = Math.abs(qUnit - cUnit) / Math.max(qUnit, cUnit);
    console.log(`  Checking dimension ${dim}: qUnit=${qUnit}, cUnit=${cUnit}, diff=${diff}`);
    if (diff > tolerance) {
      return false;
    }
  }

  return true;
}

async function test() {
  const query = 'ميريندا برتقال مشروب غازي 325مل';
  const candidate = 'ميريندا برتقال 320مل';

  console.log('--- Phase 1: Normalization ---');
  const normalizedQuery = normalizeArabic(query);
  const normalizedCandidate = normalizeArabic(candidate);
  console.log('Query Normalized:', normalizedQuery);
  console.log('Candidate Normalized:', normalizedCandidate);

  console.log('--- Phase 2: Brand Guard ---');
  const brandToken = normalizedQuery
    .split(/\s+/)
    .find((w) => w.length >= 2 && !BRAND_GUARD_STOPWORDS_AR.has(w)) ?? '';
  console.log('Extracted Brand Token:', brandToken);
  
  const brandGuardPassed = brandToken && normalizedCandidate.includes(brandToken);
  console.log('Brand Guard Passed?', brandGuardPassed);

  console.log('--- Phase 3: Size Guard ---');
  const sizeGuardPassed = sizeGuardPasses(query, candidate);
  console.log('Size Guard Passed?', sizeGuardPassed);

  console.log('--- Phase 4: Similarity ---');
  const similarity = diceCoefficient(normalizedQuery, normalizedCandidate);
  console.log('Similarity Score:', similarity);

  console.log('--- Phase 5: Matching Logic ---');
  const isFastPath = similarity >= 0.85;
  const isFuzzyPath = similarity >= 0.50 && similarity < 0.85;
  console.log('Is Fast Path?', isFastPath);
  console.log('Is Fuzzy Path?', isFuzzyPath);
}

test();
