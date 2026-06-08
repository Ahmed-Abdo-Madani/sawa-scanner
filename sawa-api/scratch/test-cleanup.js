const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load .env
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

function normalizeHsMerchantName(rawName) {
  if (!rawName) return '';
  let name = rawName.trim();

  // 1. Strip HungerStation delivery estimations (e.g., "25 - 40mins" or "10-20mins" or "٣٠-٤٥ دقيقة" or "1.5 - 2hours")
  name = name.replace(/(?:[\d\u0660-\u0669]+(?:\.[\d\u0660-\u0669]+)?\s*-?\s*[\d\u0660-\u0669]+(?:\.[\d\u0660-\u0669]+)?|[\d\u0660-\u0669]+(?:\.[\d\u0660-\u0669]+)?)\s*(?:mins|min|hours|hour|hour-min|hours-mins|دقيقة|دقيقه|د|ساعة|ساعه|س).*$/i, '').trim();

  // 2. Collapse consecutive duplicate words (e.g., "BakeryBakery" from DOM text concat)
  name = name.replace(/([a-z])([A-Z])/g, '$1 $2');
  name = name.replace(/\b(\w+)\s+\1\b/gi, '$1');
  name = name.replace(/\s{2,}/g, ' ').trim();

  // 3. Strip "Al " prefix common in Saudi chain names if present
  if (name.toLowerCase().startsWith('al ')) {
    name = name.substring(3).trim();
  }

  // 4. Known chain aliases/overrides
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

async function main() {
  const client = new Client({
    host: process.env.DATABASE_HOST,
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USERNAME,
    password: process.env.DATABASE_PASSWORD,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  await client.connect();
  console.log('Connected to DB.');

  const res = await client.query('SELECT id, name_en, name_ar FROM merchant');
  console.log(`Loaded ${res.rows.length} merchants.`);

  const normalizedMap = new Map(); // cleanEn -> merchant
  const mergeActions = [];
  const updateActions = [];

  for (const row of res.rows) {
    const cleanEn = normalizeHsMerchantName(row.name_en);
    // Let's normalize name_ar. If it falls back to name_en or contains english characters, clean it.
    let cleanAr = row.name_ar ? normalizeHsMerchantName(row.name_ar) : '';
    // If name_ar was english-like, we normalize it. Let's make sure it doesn't end up empty or default to cleanEn
    if (!cleanAr || cleanAr.toLowerCase() === cleanEn.toLowerCase()) {
      cleanAr = row.name_ar ? row.name_ar.replace(/(?:[\d\u0660-\u0669]+\s*-?\s*[\d\u0660-\u0669]+|[\d\u0660-\u0669]+)\s*(?:mins|min|دقيقة|دقيقه|د).*$/i, '').trim() : '';
      if (!cleanAr) {
        cleanAr = cleanEn;
      }
    }

    // Special cleanups for Arabic chain overrides if name_ar is clean but we want standard name
    if (cleanAr.includes('العثيم')) cleanAr = 'العثيم';
    if (cleanAr.includes('بنده') || cleanAr.includes('بندا')) cleanAr = 'بنده';
    if (cleanAr.includes('كارفور')) cleanAr = 'كارفور';
    if (cleanAr.includes('التميمي')) cleanAr = 'أسواق التميمي';
    if (cleanAr.includes('لولو')) cleanAr = 'لولو';

    const existing = normalizedMap.get(cleanEn.toLowerCase());
    if (existing) {
      mergeActions.push({
        sourceId: row.id,
        sourceNameEn: row.name_en,
        targetId: existing.id,
        targetNameEn: existing.name_en,
        cleanEn,
        cleanAr,
      });
    } else {
      normalizedMap.set(cleanEn.toLowerCase(), { id: row.id, name_en: row.name_en, cleanEn, cleanAr });
      if (row.name_en !== cleanEn || row.name_ar !== cleanAr) {
        updateActions.push({
          id: row.id,
          oldEn: row.name_en,
          newEn: cleanEn,
          oldAr: row.name_ar,
          newAr: cleanAr,
        });
      }
    }
  }

  let out = `Loaded ${res.rows.length} merchants.\n\n--- MERGES REQUIRED ---\n`;
  for (const m of mergeActions) {
    out += `Merge: "${m.sourceNameEn}" (${m.sourceId}) -> "${m.targetNameEn}" (${m.targetId}) as "${m.cleanEn}" / "${m.cleanAr}"\n`;
  }

  out += '\n--- RENAME UPDATES REQUIRED ---\n';
  for (const u of updateActions) {
    out += `Rename: "${u.oldEn}" / "${u.oldAr}" -> "${u.newEn}" / "${u.newAr}"\n`;
  }

  fs.writeFileSync(path.join(__dirname, 'test-cleanup-output.txt'), out);
  console.log('Saved results to scratch/test-cleanup-output.txt');
  await client.end();
}

main().catch(err => console.error(err));
