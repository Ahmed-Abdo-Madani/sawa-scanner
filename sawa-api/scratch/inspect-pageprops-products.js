const fs = require('fs');

const data = JSON.parse(fs.readFileSync('scratch/meat-more-pageprops-sample.json', 'utf8'));

// Let's traverse the JSON and find all objects that have `id` and `price` or `name`
const products = [];
const traverse = (obj) => {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    obj.forEach(traverse);
    return;
  }
  if (obj.id && (obj.name || obj.title)) {
    products.push(obj);
  }
  Object.values(obj).forEach(traverse);
};

traverse(data);

console.log(`Found ${products.length} product-like nodes.`);
if (products.length > 0) {
  // Let's print unique keys of all product-like nodes
  const allKeys = new Set();
  products.forEach(p => {
    Object.keys(p).forEach(k => allKeys.add(k));
  });
  console.log('Unique keys in product nodes:', Array.from(allKeys));
  
  // Let's print a few products in detail
  console.log('Sample products:', JSON.stringify(products.slice(0, 5), null, 2));
}
