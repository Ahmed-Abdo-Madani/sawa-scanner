const fs = require('fs');
const path =
  'C:/Users/Design_Bench_12/.gemini/antigravity/brain/910d92a9-7e36-45e5-9843-af2749d98c2a/scratch/ninja-category.html';
const content = fs.readFileSync(path, 'utf8');

const regex = /\{[^{}]*"productId"[^{}]*\}/g;
let match;
while ((match = regex.exec(content)) !== null) {
  try {
    const obj = JSON.parse(match[0].replace(/\\"/g, '"'));
    console.log('FOUND PRODUCT:', JSON.stringify(obj, null, 2));
    process.exit(0);
  } catch (e) {}
}

console.log('NO PRODUCT OBJECTS FOUND');
