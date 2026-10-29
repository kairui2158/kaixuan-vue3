import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {},
  ipcMain: { handle: vi.fn() },
}))
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs')
  return {
    ...actual,
    existsSync: vi.fn(() => true),
  }
})
vi.mock('./skill-loader', () => ({
  loadSkillFolder: vi.fn(),
}))

const { readPackagePreview } = await import('./skill-package')

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
