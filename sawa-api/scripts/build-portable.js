const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

// Configuration
const BASE_DIR = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(BASE_DIR, 'portable_release');
const NODE_VERSION = 'v20.11.1';
const NODE_URL = `https://nodejs.org/dist/${NODE_VERSION}/win-x64/node.exe`;
const NODE_EXE_PATH = path.join(OUTPUT_DIR, 'node.exe');

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

function copyFolderSync(from, to) {
  if (!fs.existsSync(to)) fs.mkdirSync(to, { recursive: true });
  
  if (!fs.existsSync(from)) {
     console.warn(`Warning: Directory ${from} does not exist. Skipping.`);
     return;
  }
  
  const files = fs.readdirSync(from);
  for (const file of files) {
    const current = fs.lstatSync(path.join(from, file));
    if (current.isDirectory()) {
      copyFolderSync(path.join(from, file), path.join(to, file));
    } else {
      fs.copyFileSync(path.join(from, file), path.join(to, file));
    }
  }
}

async function run() {
  console.log('--- Sawa Scanner Portable Builder ---');
  
  // 1. Clean and Create output directory
  if (fs.existsSync(OUTPUT_DIR)) {
    console.log('Cleaning existing portable_release directory...');
    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // 2. Copy necessary files
  console.log('Copying application structure...');
  copyFolderSync(path.join(BASE_DIR, 'dist'), path.join(OUTPUT_DIR, 'dist'));
  fs.copyFileSync(path.join(BASE_DIR, 'package.json'), path.join(OUTPUT_DIR, 'package.json'));
  fs.copyFileSync(path.join(BASE_DIR, 'package-lock.json'), path.join(OUTPUT_DIR, 'package-lock.json'));

  // 3. Create .env template
  console.log('Generating auto-configured .env representing production databases...');
  
  // Dynamically resolve local network IP to configure shared Redis for workers
  const os = require('os');
  const interfaces = os.networkInterfaces();
  let localIp = '192.168.8.114';
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
        localIp = alias.address;
        break;
      }
    }
  }
  console.log(`Resolved local network IP for shared Redis: ${localIp}`);

  let envContent = '';
  try {
     const mainEnv = fs.readFileSync(path.join(BASE_DIR, '.env'), 'utf8');
     const lines = mainEnv.split('\n');
      for (const line of lines) {
        if (line.startsWith('DATABASE_') || line.startsWith('REDIS_') || line.startsWith('BARCODE_LIST_') || line.startsWith('HS_CATALOG_')) {
            let processedLine = line;
            if (line.startsWith('REDIS_HOST=')) {
              processedLine = `REDIS_HOST=${localIp}`;
            }
            envContent += processedLine + '\n';
        }
      }
  } catch (e) {
     console.warn('Could not read main .env, using blanks.');
  }

  envContent += `
HUNGERSTATION_DAILY_ENABLED=false
HUNGERSTATION_DISCOVERY_ENABLED=false
ENABLE_AI_EXTRACTION=false
INGESTION_WORKER_CONCURRENCY=5
BARCODE_LIST_REQUEST_DELAY_MS=2000
BARCODE_LIST_DAILY_BUDGET=5000
CLEAN_STALE_JOBS_ON_STARTUP=false
`;
  fs.writeFileSync(path.join(OUTPUT_DIR, '.env'), envContent);

  // 4. Create the start.bat
  console.log('Creating start-worker.bat...');
  const batContent = `@echo off
echo.
echo ==============================================
echo      SAWA SCANNER DISTRIBUTED WORKER
echo ==============================================
echo.
echo [1/2] Ensure Headless Browsers are installed...
.\\node.exe install-browsers.js

echo.
echo [2/2] Starting Worker. Press CTRL+C to stop.
.\\node.exe dist/src/main.js
pause
`;
  fs.writeFileSync(path.join(OUTPUT_DIR, 'start-worker.bat'), batContent);

  const installBrowsersContent = `const { execSync } = require('child_process');
console.log('Installing Playwright Chromium globally...');
execSync('.\\\\node.exe node_modules/playwright-core/cli.js install chromium', { stdio: 'inherit' });
`;
  fs.writeFileSync(path.join(OUTPUT_DIR, 'install-browsers.js'), installBrowsersContent);

  // 4b. Create queue-barcode-list-job.js (cleans stale jobs first, then queues new one)
  console.log('Creating queue-barcode-list-job.js...');
  const queueJobLines = [
    'const http = require("http");',
    '',
    'function httpRequest(method, path) {',
    '  return new Promise((resolve, reject) => {',
    '    const req = http.request({',
    '      hostname: "localhost", port: 3000, path, method,',
    '      headers: { "Content-Type": "application/json", "x-dev-admin-secret": "sawa-scanner-dev-2026" }',
    '    }, (res) => {',
    '      let data = "";',
    '      res.on("data", c => data += c);',
    '      res.on("end", () => resolve({ status: res.statusCode, body: data }));',
    '    });',
    '    req.on("error", reject);',
    '    if (method === "POST") req.write(JSON.stringify({ dryRun: false }));',
    '    req.end();',
    '  });',
    '}',
    '',
    'async function main() {',
    '  // Step 1: Clean any stale/zombie jobs',
    '  console.log("Cleaning stale barcode-list jobs...");',
    '  try {',
    '    const clean = await httpRequest("DELETE", "/ingestion/jobs/stale/barcode-list-names");',
    '    const parsed = JSON.parse(clean.body);',
    '    if (parsed.removed > 0) {',
    '      console.log("Removed", parsed.removed, "stale job(s):", parsed.ids.join(", "));',
    '    } else {',
    '      console.log("No stale jobs found. Queue is clear.");',
    '    }',
    '  } catch(e) {',
    '    console.log("Could not clean stale jobs:", e.message);',
    '  }',
    '',
    '  // Step 2: Queue new job',
    '  console.log("Queuing new barcode-list scraping job...");',
    '  try {',
    '    const res = await httpRequest("POST", "/ingestion/barcode-list-names");',
    '    const parsed = JSON.parse(res.body);',
    '    if (res.status >= 200 && res.status < 300) {',
    '      console.log("Job queued successfully! Job ID:", parsed.jobId);',
    '    } else if (res.status === 409) {',
    '      console.log("Job already running (ID:", parsed.jobId + "). Worker is processing.");',
    '    } else {',
    '      console.log("Unexpected response:", res.status, res.body);',
    '    }',
    '  } catch(e) {',
    '    console.error("Error:", e.message);',
    '    console.error("Make sure the worker is running first.");',
    '  }',
    '}',
    '',
    'main();',
  ];
  fs.writeFileSync(path.join(OUTPUT_DIR, 'queue-barcode-list-job.js'), queueJobLines.join('\n'));

  // 4c. Create clean-stale-jobs.bat
  console.log('Creating clean-stale-jobs.bat...');
  const cleanStaleJobsBat = [
    '@echo off',
    'echo.',
    'echo ==============================================',
    'echo   CLEAN STALE JOBS',
    'echo ==============================================',
    'echo.',
    'echo Connecting to local worker to clean zombie barcode-list jobs...',
    '.\\node.exe -e "const http = require(\'http\'); const req = http.request({ hostname: \'localhost\', port: 3000, path: \'/ingestion/jobs/stale/barcode-list-names\', method: \'DELETE\', headers: { \'x-dev-admin-secret\': \'sawa-scanner-dev-2026\' } }, (res) => { let d = \'\'; res.on(\'data\', c => d += c); res.on(\'end\', () => console.log(d)); }); req.on(\'error\', e => console.error(\'Error:\', e.message)); req.end();"',
    'echo.',
    'pause',
  ];
  fs.writeFileSync(path.join(OUTPUT_DIR, 'clean-stale-jobs.bat'), cleanStaleJobsBat.join('\r\n'));

  // 4d. Create a single all-in-one run-barcode-list.bat
  console.log('Creating run-barcode-list.bat...');
  const runBarcodeListBat = [
    '@echo off',
    'echo.',
    'echo ==============================================',
    'echo   BARCODE-LIST NAME SCRAPING - ALL IN ONE',
    'echo ==============================================',
    'echo.',
    'echo To change the budget, edit .env file:',
    'echo   BARCODE_LIST_DAILY_BUDGET=5000',
    'echo.',
    'echo [1/3] Ensure Headless Browsers are installed...',
    '.\\node.exe install-browsers.js',
    'echo.',
    'echo [2/3] Starting Worker in background...',
    'start "Sawa Worker" /MIN .\\node.exe dist\\src\\main.js',
    'echo Waiting 20 seconds for worker to initialize...',
    'timeout /t 20 /nobreak > nul',
    'echo.',
    'echo [3/3] Cleaning stale jobs and queuing new scraping job...',
    '.\\node.exe queue-barcode-list-job.js',
    'echo.',
    'echo ============================================',
    'echo   Worker is processing now.',
    'echo   Check the minimized "Sawa Worker" window',
    'echo   for live progress logs.',
    'echo   Close that window when done.',
    'echo ============================================',
    'pause',
  ];
  fs.writeFileSync(path.join(OUTPUT_DIR, 'run-barcode-list.bat'), runBarcodeListBat.join('\r\n'));

  // 4e. Create queue-hs-catalog-job.js
  console.log('Creating queue-hs-catalog-job.js...');
  const queueHsJobLines = [
    'const http = require("http");',
    '',
    'function httpRequest(method, path) {',
    '  return new Promise((resolve, reject) => {',
    '    const req = http.request({',
    '      hostname: "localhost", port: 3000, path, method,',
    '      headers: { "Content-Type": "application/json", "x-dev-admin-secret": "sawa-scanner-dev-2026" }',
    '    }, (res) => {',
    '      let data = "";',
    '      res.on("data", c => data += c);',
    '      res.on("end", () => resolve({ status: res.statusCode, body: data }));',
    '    });',
    '    req.on("error", reject);',
    '    if (method === "POST") req.write(JSON.stringify({ dryRun: false }));',
    '    req.end();',
    '  });',
    '}',
    '',
    'async function main() {',
    '  // Step 1: Clean any stale/zombie jobs',
    '  console.log("Cleaning stale hs-catalog-scrape jobs...");',
    '  try {',
    '    const clean = await httpRequest("DELETE", "/ingestion/jobs/stale/hs-catalog-scrape");',
    '    const parsed = JSON.parse(clean.body);',
    '    if (parsed.removed > 0) {',
    '      console.log("Removed", parsed.removed, "stale job(s):", parsed.ids.join(", "));',
    '    } else {',
    '      console.log("No stale jobs found. Queue is clear.");',
    '    }',
    '  } catch(e) {',
    '    console.log("Could not clean stale jobs:", e.message);',
    '  }',
    '',
    '  // Step 2: Queue new job',
    '  console.log("Queuing new hs-catalog scraping job...");',
    '  try {',
    '    const res = await httpRequest("POST", "/ingestion/hs-catalog-scrape");',
    '    const parsed = JSON.parse(res.body);',
    '    if (res.status >= 200 && res.status < 300) {',
    '      console.log("Job queued successfully! Job ID:", parsed.jobId);',
    '    } else if (res.status === 409) {',
    '      console.log("Job already running (ID:", parsed.jobId + "). Worker is processing.");',
    '    } else {',
    '      console.log("Unexpected response:", res.status, res.body);',
    '    }',
    '  } catch(e) {',
    '    console.error("Error:", e.message);',
    '    console.error("Make sure the worker is running first.");',
    '  }',
    '}',
    '',
    'main();',
  ];
  fs.writeFileSync(path.join(OUTPUT_DIR, 'queue-hs-catalog-job.js'), queueHsJobLines.join('\n'));

  // 4f. Create clean-stale-hs-jobs.bat
  console.log('Creating clean-stale-hs-jobs.bat...');
  const cleanStaleHsJobsBat = [
    '@echo off',
    'echo.',
    'echo ============================================== ',
    'echo   CLEAN STALE HS CATALOG JOBS',
    'echo ============================================== ',
    'echo.',
    'echo Connecting to local worker to clean zombie hs-catalog-scrape jobs...',
    '.\\node.exe -e "const http = require(\'http\'); const req = http.request({ hostname: \'localhost\', port: 3000, path: \'/ingestion/jobs/stale/hs-catalog-scrape\', method: \'DELETE\', headers: { \'x-dev-admin-secret\': \'sawa-scanner-dev-2026\' } }, (res) => { let d = \'\'; res.on(\'data\', c => d += c); res.on(\'end\', () => console.log(d)); }); req.on(\'error\', e => console.error(\'Error:\', e.message)); req.end();"',
    'echo.',
    'pause',
  ];
  fs.writeFileSync(path.join(OUTPUT_DIR, 'clean-stale-hs-jobs.bat'), cleanStaleHsJobsBat.join('\r\n'));

  // 4g. Create run-hs-catalog.bat
  console.log('Creating run-hs-catalog.bat...');
  const runHsCatalogBat = [
    '@echo off',
    'echo.',
    'echo ============================================== ',
    'echo   HUNGERSTATION CATALOG SCRAPING - ALL IN ONE',
    'echo ============================================== ',
    'echo.',
    'echo To change settings, edit .env file:',
    'echo   HS_CATALOG_STORE_URL',
    'echo   HS_CATALOG_MAX_CATEGORIES',
    'echo   HS_CATALOG_MAX_PRODUCTS_PER_CAT',
    'echo.',
    'echo [1/3] Ensure Headless Browsers are installed...',
    '.\\node.exe install-browsers.js',
    'echo.',
    'echo [2/3] Starting Worker in background...',
    'start "Sawa Worker" /MIN .\\node.exe dist\\src\\main.js',
    'echo Waiting 20 seconds for worker to initialize...',
    'timeout /t 20 /nobreak > nul',
    'echo.',
    'echo [3/3] Cleaning stale jobs and queuing new scraping job...',
    '.\\node.exe queue-hs-catalog-job.js',
    'echo.',
    'echo ============================================',
    'echo   Worker is processing now.',
    'echo   Check the minimized "Sawa Worker" window',
    'echo   for live progress logs.',
    'echo   Close that window when done.',
    'echo ============================================',
    'pause',
  ];
  fs.writeFileSync(path.join(OUTPUT_DIR, 'run-hs-catalog.bat'), runHsCatalogBat.join('\r\n'));

  // 5. Install dependencies locally (since target PC won't have npm)
  console.log('Installing production dependencies for the portable module...');
  execSync('npm install --omit=dev --ignore-scripts', { cwd: OUTPUT_DIR, stdio: 'inherit' });

  // 6. Download Node.exe
  console.log(`Downloading standalone Node.js (${NODE_VERSION}) from official servers...`);
  await downloadFile(NODE_URL, NODE_EXE_PATH);
  
  console.log('==============================================');
  console.log('  SUCCESS: Portable Package Created!  ');
  console.log('==============================================');
  console.log(`Open the folder at: ${OUTPUT_DIR}`);
  console.log(`To distribute: Compress the portable_release folder into a .zip file and send it to your team.`);
}

run().catch(console.error);
