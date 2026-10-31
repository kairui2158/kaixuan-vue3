import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

vi.mock('./skill-loader', async () => {
  const actual = await vi.importActual('./skill-loader')
  return {
    loadSkillFolder: vi.fn(actual.loadSkillFolder),
  }
})

const { loadSkillFolder } = await import('./skill-loader')
const {
  readPackagePreview,
  copyZipToSkillLibrary,
  createZipBuffer,
  exportSkillPackage,
  resolveSkillLibraryVersion,
  setSkillLibraryRoot,
} = await import('./skill-package')

describe('skill package deai manifest preflight', () => {
  it('loads the packaged CJS deai contract validator before previewing a package', async () => {
    const shared = await import('../../dist-renderer/skillDeaiContractValidation.cjs')

    expect(shared).toBeTruthy()
    expect(typeof shared.validateSkillDeaiMeta).toBe('function')
    expect(shared.validateSkillDeaiMeta({
      contractVersion: 1,
      generation: 'suffix-only',
      finalStepDetection: 'off',
    }).valid).toBe(true)
    expect(readPackagePreview).toBeTruthy()
  })
})

describe('skill package install/export equivalence', () => {
  let root
  let binary

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'shenyi-skill-package-'))
    setSkillLibraryRoot(path.join(root, 'skill-library'))
    binary = Buffer.from([0, 137, 80, 78, 71, 13, 10, 26, 10, 255, 254, 0, 128])
  })

  afterEach(() => {
    setSkillLibraryRoot('')
    fs.rmSync(root, { recursive: true, force: true })
  })

  it('round-trips a folder package through ZIP install and export without corrupting binary resources', async () => {
    const initialZip = path.join(root, 'initial.zip')
    fs.writeFileSync(initialZip, createZipBuffer({
      'SKILL.md': '---\nid: roundtrip\nname: Roundtrip Skill\n---\n\n入口说明',
      'template.md': '运行模板',
      'meta.json': JSON.stringify({
        intents: ['generate'],
        contextPolicy: { chatHistory: 'none', includeOutline: false },
      }),
      'skill.json': JSON.stringify({
        id: 'roundtrip',
        name: 'Roundtrip Skill',
        version: '1.0.0',
      }),
      'assets/binary.bin': binary,
    }))

    const installed = await copyZipToSkillLibrary(initialZip, 'roundtrip', '1.0.0')
    expect(installed.ok).toBe(true)
    expect(installed.skill.id).toBe('roundtrip')
    expect(installed.skill.name).toBe('Roundtrip Skill')
    expect(installed.skill.template).toBe('运行模板')
    expect(installed.skill.meta).toMatchObject({
      intents: ['generate'],
      contextPolicy: { chatHistory: 'none', includeOutline: false },
    })

    const exportZip = path.join(root, 'roundtrip.zip')
    const exported = exportSkillPackage('roundtrip', exportZip, '1.0.0')
    expect(exported.ok).toBe(true)
    expect(exported.version).toBe('1.0.0')
    expect(exported.fileCount).toBe(6)

    fs.rmSync(path.join(root, 'skill-library', 'roundtrip'), {
      recursive: true,
      force: true,
    })
    const reinstalled = await copyZipToSkillLibrary(exportZip, 'roundtrip', '1.0.0')
    expect(reinstalled.ok).toBe(true)
    expect(reinstalled.skill.id).toBe('roundtrip')
    expect(reinstalled.skill.name).toBe('Roundtrip Skill')
    expect(reinstalled.skill.template).toBe('运行模板')
    expect(reinstalled.skill.meta).toMatchObject({
      intents: ['generate'],
      contextPolicy: { chatHistory: 'none', includeOutline: false },
    })

    const binaryPath = path.join(
      root,
      'skill-library',
      'roundtrip',
      '1.0.0',
      'assets',
      'binary.bin',
    )
    expect(fs.existsSync(binaryPath)).toBe(true)
    const hash = crypto.createHash('sha256').update(fs.readFileSync(binaryPath)).digest('hex')
    expect(hash).toBe(crypto.createHash('sha256').update(binary).digest('hex'))
  })

  it('resolves prerelease versions explicitly and keeps releases ahead by default', () => {
    const skillRoot = path.join(root, 'skill-library', 'roundtrip')
    for (const version of ['1.0.0', '1.0.1-beta.1', '1.1.0']) {
      const folder = path.join(skillRoot, version)
      fs.mkdirSync(folder, { recursive: true })
      fs.writeFileSync(path.join(folder, 'SKILL.md'), '---\nid: roundtrip\n---\n\n模板')
    }

    const prerelease = resolveSkillLibraryVersion('roundtrip', '1.0.1-beta.1')
    expect(prerelease.ok).toBe(true)
    expect(prerelease.version).toBe('1.0.1-beta.1')

    const latest = resolveSkillLibraryVersion('roundtrip', '')
    expect(latest.ok).toBe(true)
    expect(latest.version).toBe('1.1.0')
  })
})
