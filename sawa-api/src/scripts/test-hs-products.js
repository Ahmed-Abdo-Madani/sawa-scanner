const fs = require('fs');
const data = JSON.parse(fs.readFileSync('next_data.json', 'utf8'));

let productCount = 0;
function findProducts(json) {
  if (!json || typeof json !== 'object') return;
  if (Array.isArray(json)) {
    for (const item of json) findProducts(item);
    return;
  }
  if (json.type === 'product' || (json.id && json.price && json.title)) {
    productCount++;
  }
  for (const val of Object.values(json)) findProducts(val);
}
findProducts(data);
console.log('Total products in NEXT_DATA:', productCount);
