import axios from 'axios';
import * as fs from 'fs';

async function test() {
  try {
    const res = await axios.get(
      'https://ananinja.com/sa/en/category/fruits-and-vegetables-1011',
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        },
      },
    );

    const body = res.data;

    const matches = Array.from(
      body.matchAll(/self\.__next_f\.push\(\[1,"(.*?\\])"\]\)/g),
    );
    let assembled = '';

    matches.forEach((m: any) => {
      try {
        const unescaped = m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        assembled += unescaped + '\n';
      } catch (e) {}
    });

    // Let's just find anything resembling "productId" in the entire raw body
    // and grab 200 chars around it
    const idIdx = body.indexOf('"productId"');
    if (idIdx > -1) {
      console.log(
        'Context of productId:',
        body.substring(Math.max(0, idIdx - 100), idIdx + 300),
      );
    } else {
      const escapedIdIdx = body.indexOf('\\"productId\\"');
      if (escapedIdIdx > -1) {
        console.log(
          'Context of \\"productId\\":',
          body.substring(Math.max(0, escapedIdIdx - 100), escapedIdIdx + 500),
        );
      } else {
        console.log('Could not find productId string at all');
      }
    }
  } catch (e) {
    console.error(e.message);
  }
}

test();
