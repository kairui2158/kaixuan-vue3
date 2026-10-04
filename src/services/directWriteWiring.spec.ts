import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const workspaceRoot = resolve(__dirname, '../..')

function readComponentSource(relativePath: string): string {
  return readFileSync(resolve(workspaceRoot, relativePath), 'utf8')
}

describe('direct write production wiring', () => {
  it('emits legacy history neutralization from both outline and home production entries', () => {
    for (const relativePath of [
      'src/components/common/OutlineWorkspace.vue',
      'src/components/chat/ChatPanel.vue',
    ]) {
      const source = readComponentSource(relativePath)
      expect(source).toContain("type: 'editor-context-policy'")
      expect(source).toContain('contextBundle.execution.historyNeutralization')
      expect(source).toContain('historyNeutralization: historyNeutralization || null')
    }
  })
})
