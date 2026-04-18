import axios from 'axios';

async function test() {
  const res = await axios.get('https://ananinja.com/sa/en', {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    },
  });

  const body = res.data;
  const categories = body.match(/href="\/sa\/en\/category\/[^"]+"/g);
  if (categories && categories.length > 0) {
    const unique = [...new Set(categories)];
    console.log('Categories found:', unique.slice(0, 10));
  } else {
    console.log('No categories found. Let us check ANY hrefs:');
    const hrefs = body.match(/href="[^"]+"/g);
    console.log(hrefs?.slice(0, 20));
  }
}

test();
