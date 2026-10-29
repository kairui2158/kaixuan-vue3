import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/shenyi-user-data') },
  ipcMain: { handle: vi.fn() },
  shell: {},
}))

const storage = await import('./storage')

describe('electron ipc storage', () => {
  let dataDir
  let handlers

  beforeEach(async () => {
    dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'shenyi-storage-'))
    const registered = new Map()
    handlers = registered
    storage.setDataDir(dataDir)
    storage.registerStorageHandlers({ handle: (channel, handler) => registered.set(channel, handler) })
  })

  afterEach(async () => {
    await fs.rm(dataDir, { recursive: true, force: true })
  })

  async function write(key, value) {
    const result = await handlers.get('storage:write')(null, key, value)
    expect(result).toBe(true)
  }

  async function read(key) {
    return await handlers.get('storage:read')(null, key)
  }

  async function remove(key) {
    return await handlers.get('storage:remove')(null, key)
  }

  it('recovers the backup after a crash leaves the primary file missing', async () => {
    await write('checkpoint', { id: 'last-good', status: 'saved' })
    await fs.rename(
      path.join(dataDir, 'checkpoint.json'),
      path.join(dataDir, 'checkpoint.json.bak'),
    )

    expect(await read('checkpoint')).toEqual({ id: 'last-good', status: 'saved' })
    await expect(fs.access(path.join(dataDir, 'checkpoint.json'))).resolves.toBeUndefined()
    await expect(fs.access(path.join(dataDir, 'checkpoint.json.bak'))).rejects.toThrow()
  })

  it('keeps the backup for a newly created key when the primary is missing', async () => {
    await fs.writeFile(path.join(dataDir, 'never-written.json.bak'), 'not-json', 'utf8')

    expect(await read('never-written')).toBeNull()
    await expect(fs.access(path.join(dataDir, 'never-written.json.bak'))).resolves.toBeUndefined()
  })

  it('treats a persisted JSON null as a valid value instead of corruption', async () => {
    await fs.writeFile(path.join(dataDir, 'null-project.json'), 'null', 'utf8')
    await fs.writeFile(path.join(dataDir, 'null-project.json.bak'), '{"valid":true}', 'utf8')

    expect(await read('null-project')).toBeNull()
    await expect(fs.access(path.join(dataDir, 'null-project.json.bak'))).resolves.toBeUndefined()
    await expect(fs.access(path.join(dataDir, 'storage-corruption.log'))).rejects.toThrow()
  })

  it('does not resurrect a removed key from its backup', async () => {
    await write('breakpoint', { status: 'step-3-completed' })
    await write('breakpoint', { status: 'step-4-completed' })

    expect(await remove('breakpoint')).toBe(true)
    expect(await read('breakpoint')).toBeNull()
    await expect(fs.access(path.join(dataDir, 'breakpoint.json'))).rejects.toThrow()
    await expect(fs.access(path.join(dataDir, 'breakpoint.json.bak'))).rejects.toThrow()
  })

  it('reports removal failure only for the test-designated key', async () => {
    process.env.SHENYI_TEST_STORAGE_REMOVE_FAILURE_KEY = 'owner-checkpoint'
    try {
      await write('owner-checkpoint', { status: 'completed' })
      await write('other-checkpoint', { status: 'completed' })

      expect(await remove('owner-checkpoint')).toBe(false)
      expect(await remove('other-checkpoint')).toBe(true)
      expect(await read('owner-checkpoint')).toEqual({ status: 'completed' })
      expect(await read('other-checkpoint')).toBeNull()
    } finally {
      delete process.env.SHENYI_TEST_STORAGE_REMOVE_FAILURE_KEY
    }
  })

  it('does not migrate real documents data in explicit test isolation', async () => {
    process.env.SHENYI_DATA_DIR = dataDir
    process.env.SHENYI_ALLOW_TEST_ISOLATION = '1'
    try {
      await handlers.get('storage:list')(null)

      await expect(fs.access(path.join(dataDir, '.migrated'))).rejects.toThrow()
    } finally {
      delete process.env.SHENYI_DATA_DIR
      delete process.env.SHENYI_ALLOW_TEST_ISOLATION
    }
  })
})
