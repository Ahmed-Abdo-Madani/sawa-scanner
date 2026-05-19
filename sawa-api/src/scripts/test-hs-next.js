const fs = require('fs');
const html = fs.readFileSync('hs-supermarkets-debug.html', 'utf8');
const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/);
if (match) {
  const data = JSON.parse(match[1]);
  fs.writeFileSync('next_data.json', JSON.stringify(data, null, 2));
  console.log('Saved next_data.json');
} else {
  console.log('Not found');
}
