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
})
