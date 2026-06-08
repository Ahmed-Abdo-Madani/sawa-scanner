const fs = require('fs');
const path = require('path');

function getFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFiles(filePath));
    } else {
      results.push(filePath);
    }
  });
  return results;
}

function checkLocks() {
  const targetDir = 'c:\\Users\\Design_Bench_12\\Documents\\sawa-scanner\\sawa-api\\portable_release';
  if (!fs.existsSync(targetDir)) {
    console.log('Directory does not exist:', targetDir);
    return;
  }

  console.log('Scanning files in portable_release for locks...');
  const files = getFiles(targetDir);
  console.log(`Found ${files.length} files. Testing access...`);

  let lockedCount = 0;
  files.forEach(file => {
    try {
      // Try to open the file with read-write flags to see if it is locked
      const fd = fs.openSync(file, 'r+');
      fs.closeSync(fd);
    } catch (err) {
      if (err.code === 'EBUSY' || err.code === 'EACCES' || err.code === 'EPERM') {
        console.log(`Locked file: ${file} (Error: ${err.code})`);
        lockedCount++;
      }
    }
  });

  console.log(`\nScan finished. Found ${lockedCount} locked file(s).`);
}

checkLocks();
