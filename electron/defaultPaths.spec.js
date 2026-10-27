import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import defaultPaths from './defaultPaths.js'

function makeTempDir(kind) {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'shenyi-default-paths-'))
}

describe('default storage paths', () => {
  it('prefers the fixed D root when it is writable', () => {
    const documentsDir = makeTempDir()
    const root = makeTempDir()
    expect(defaultPaths.getDataRoot(documentsDir, root)).toBe(root)
    expect(defaultPaths.getUserDataDir(path.join(documentsDir, 'fallback'), root))
      .toBe(path.join(root, '_app-user-data'))
    expect(defaultPaths.getLegacyDataDir(documentsDir, root))
      .toBe(path.join(root, '_legacy'))
    fs.rmSync(documentsDir, { recursive: true, force: true })
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('falls back to the documents directory when the preferred root is read-only', () => {
    const documentsDir = makeTempDir()
    const preferredRoot = makeTempDir()
    fs.rmSync(preferredRoot, { recursive: true, force: true })
    // A parent that already exists as a file makes recursive mkdir fail.
    fs.writeFileSync(preferredRoot, 'blocked', 'utf8')
    expect(defaultPaths.getDataRoot(documentsDir, preferredRoot))
      .toBe(path.join(documentsDir, '神意助手数据'))
    expect(defaultPaths.getUserDataDir(path.join(documentsDir, 'fallback'), preferredRoot))
      .toBe(path.join(documentsDir, 'fallback'))
    expect(defaultPaths.getLegacyDataDir(documentsDir, preferredRoot))
      .toBe(path.join(documentsDir, '写作助手数据'))
    fs.rmSync(preferredRoot, { force: true })
    fs.rmSync(documentsDir, { recursive: true, force: true })
  })

  it('respects explicit environment overrides', () => {
    const documentsDir = makeTempDir()
    const root = makeTempDir()
    const previousRoot = process.env.SHENYI_DEFAULT_DATA_ROOT
    const previousUserData = process.env.SHENYI_USER_DATA_DIR
    const configuredUserData = makeTempDir()
    process.env.SHENYI_DEFAULT_DATA_ROOT = root
    process.env.SHENYI_USER_DATA_DIR = configuredUserData
    try {
      expect(defaultPaths.getDataRoot(documentsDir)).toBe(root)
      expect(defaultPaths.getUserDataDir(path.join(documentsDir, 'fallback'))).toBe(configuredUserData)
      expect(defaultPaths.getLegacyDataDir(documentsDir)).toBe(path.join(root, '_legacy'))
    } finally {
      if (previousRoot === undefined) delete process.env.SHENYI_DEFAULT_DATA_ROOT
      else process.env.SHENYI_DEFAULT_DATA_ROOT = previousRoot
      if (previousUserData === undefined) delete process.env.SHENYI_USER_DATA_DIR
      else process.env.SHENYI_USER_DATA_DIR = previousUserData
      fs.rmSync(documentsDir, { recursive: true, force: true })
      fs.rmSync(root, { recursive: true, force: true })
      fs.rmSync(configuredUserData, { recursive: true, force: true })
    }
  })
})
