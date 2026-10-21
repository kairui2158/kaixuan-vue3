import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import { parseOutlineStructure } from './outlineStructure'

const CLIENT_OUTLINE_PATH = 'C:/Users/凯瑞/Desktop/测试/《绿潮》大纲总纲.md'
const clientOutline = fs.existsSync(CLIENT_OUTLINE_PATH)
  ? fs.readFileSync(CLIENT_OUTLINE_PATH, 'utf8')
  : null

describe.skipIf(!clientOutline)('client outline semantic section ids', () => {
  it('does not use the deprecated positional heading ids', () => {
    if (!clientOutline) throw new Error('client outline fixture is missing')
    const structure = parseOutlineStructure(clientOutline)
    const sections: string[] = []
    const walk = (nodes: typeof structure.nodes) => {
      for (const node of nodes) {
        sections.push(node.id)
        walk(node.children)
      }
    }
    walk(structure.nodes)

    expect(sections).not.toContain('heading-16801')
    expect(sections).not.toContain('heading-17356')
    expect(sections).not.toContain('heading-18104')
  })
})
