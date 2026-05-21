import * as fs from 'fs';

function test() {
  const html = fs.readFileSync('scratch/parkcenter.html', 'utf8');

  // Search for any occurrence of '/api/' or 'api.zid' or similar
  const re = /(?:https?:\/\/[^\/]+)?\/[^\s"'>]*api[^\s"'>]*/gi;
  const matches = html.match(re) || [];
  console.log(`Found ${matches.length} matches for 'api':`);
  console.log(Array.from(new Set(matches)).slice(0, 30));

  // Let's search for 'token' or 'auth' in Javascript blocks
  const scripts = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/gi) || [];
  console.log(`Found ${scripts.length} script blocks`);
  for (let i = 0; i < scripts.length; i++) {
    const s = scripts[i];
    if (s.includes('Token') || s.includes('token') || s.includes('auth') || s.includes('Authorization')) {
      console.log(`\n--- Script block ${i} contains token/auth: ---`);
      console.log(s.substring(0, 1000));
    }
  }
}

test();
