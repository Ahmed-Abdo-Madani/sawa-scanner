import { diceCoefficient } from '../src/utils/string-similarity';

const query = 'ميريندا برتقال مشروب غازي 325مل';
const candidate = 'ميريندا برتقال 320مل';

const normalizedQuery = query
  .replace(/[\u064B-\u065F\u0670]/g, '')
  .replace(/[أإآٱ]/g, 'ا')
  .replace(/ة/g, 'ه')
  .replace(/ـ/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

const normalizedCandidate = candidate
  .replace(/[\u064B-\u065F\u0670]/g, '')
  .replace(/[أإآٱ]/g, 'ا')
  .replace(/ة/g, 'ه')
  .replace(/ـ/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

const similarity = diceCoefficient(normalizedQuery, normalizedCandidate);
console.log('Normalized Query:', normalizedQuery);
console.log('Normalized Candidate:', normalizedCandidate);
console.log('Similarity:', similarity);
console.log('Similarity >= 0.50?', similarity >= 0.50);
console.log('Similarity >= 0.85 (Fast Path)?', similarity >= 0.85);
