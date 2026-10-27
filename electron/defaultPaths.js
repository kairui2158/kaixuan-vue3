const fs = require('fs')
const path = require('path')

const DEFAULT_DATA_ROOT = 'D:\\神意助手数据'
const ENV_DATA_ROOT = 'SHENYI_DEFAULT_DATA_ROOT'
const ENV_USER_DATA_DIR = 'SHENYI_USER_DATA_DIR'

function isWritableDirectory(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true })
    var probe = path.join(dir, '.write-probe')
    fs.writeFileSync(probe, String(Date.now()), 'utf8')
    fs.unlinkSync(probe)
    return true
  } catch (e) {
    return false
  }
}

function getDataRoot(documentsDir, preferredRoot) {
  var configured = process.env[ENV_DATA_ROOT]
  if (configured) return path.resolve(configured)
  var root = preferredRoot || DEFAULT_DATA_ROOT
  if (isWritableDirectory(root)) return root
  return path.join(documentsDir, '神意助手数据')
}

function getUserDataDir(fallbackDir, preferredRoot) {
  var configured = process.env[ENV_USER_DATA_DIR]
  if (configured) return path.resolve(configured)
  var root = preferredRoot || DEFAULT_DATA_ROOT
  var fixed = path.join(root, '_app-user-data')
  if (isWritableDirectory(fixed)) return fixed
  return fallbackDir
}

function getLegacyDataDir(documentsDir, preferredRoot) {
  var configured = process.env[ENV_DATA_ROOT]
  if (configured) return path.join(path.resolve(configured), '_legacy')
  var root = preferredRoot || DEFAULT_DATA_ROOT
  var fixed = path.join(root, '_legacy')
  if (isWritableDirectory(fixed)) return fixed
  return path.join(documentsDir, '写作助手数据')
}

module.exports = { getDataRoot, getUserDataDir, getLegacyDataDir }
