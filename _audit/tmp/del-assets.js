const fs = require('fs');
const path = require('path');
const assetsDir = path.join('D:\\codex\\novel-workshop-vue3', 'dist-renderer', 'assets');
try {
  if (fs.existsSync(assetsDir)) {
    fs.rmSync(assetsDir, { recursive: true, force: true });
    console.log('DELETED assets dir');
  } else {
    console.log('assets dir does not exist');
  }
} catch(e) {
  console.log('ERROR: ' + e.message);
}
