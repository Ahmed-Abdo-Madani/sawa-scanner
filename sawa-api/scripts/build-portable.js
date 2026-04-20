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
  let envContent = '';
  try {
     const mainEnv = fs.readFileSync(path.join(BASE_DIR, '.env'), 'utf8');
     const lines = mainEnv.split('\n');
     for (const line of lines) {
        if (line.startsWith('DATABASE_') || line.startsWith('REDIS_')) {
            envContent += line + '\n';
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

  // 5. Install dependencies locally (since target PC won't have npm)
  console.log('Installing production dependencies for the portable module...');
  execSync('npm install --omit=dev', { cwd: OUTPUT_DIR, stdio: 'inherit' });

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
