const fs = require('fs')
const os = require('os')
const path = require('path')

const mode = process.argv[2] || 'backup'
const dataDir = path.join(os.homedir(), 'Documents', '神意助手数据')
const backupDir = path.join(process.cwd(), '_audit', 'tmp', 'data_backup')

function safeName(name) {
  return name.replace(/[^A-Za-z0-9._-]/g, '_')
}

if (mode === 'backup') {
  fs.mkdirSync(backupDir, { recursive: true })
  const names = fs.readdirSync(dataDir).filter((n) => n.endsWith('.json'))
  for (const n of names) {
    fs.copyFileSync(path.join(dataDir, n), path.join(backupDir, safeName(n)))
  }
  console.log('BACKUP_OK files=' + names.length)
} else if (mode === 'restore') {
  if (!fs.existsSync(backupDir)) {
    console.error('NO_BACKUP')
    process.exit(1)
  }
  const backups = fs.readdirSync(backupDir)
  for (const b of backups) {
    fs.copyFileSync(path.join(backupDir, b), path.join(dataDir, b))
  }
  console.log('RESTORE_OK files=' + backups.length)
} else {
  console.error('usage: node data_backup.cjs backup|restore')
  process.exit(1)
}
