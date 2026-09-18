import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const { loadSkillFolder } = await import('./skill-loader')

function tempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `shenyi-skill-${name}-`))
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, content, 'utf8')
}

describe('loadSkillFolder protocol maturity', () => {
  let directory

  beforeEach(() => {
    directory = tempDir('protocol')
  })

  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true })
  })

  it('falls back to the SKILL.md body when template.md is missing', () => {
    write(path.join(directory, 'SKILL.md'), '---\nid: s1\nname: Skill One\n---\n\n正文模板')

    const result = loadSkillFolder(directory)

    expect(result.ok).toBe(true)
    expect(result.skill.template).toBe('正文模板')
    expect(result.skill.warnings.some(item => item.code === 'template-fallback-skill-md')).toBe(true)
  })

  it('keeps the SKILL.md body when template.md exists', () => {
    write(path.join(directory, 'SKILL.md'), '---\nid: s1\nname: Skill One\n---\n\n入口说明正文')
    write(path.join(directory, 'template.md'), '执行模板')

    const result = loadSkillFolder(directory)

    expect(result.ok).toBe(true)
    expect(result.skill.body).toBe('入口说明正文')
    expect(result.skill.template).toBe('执行模板')
    expect(result.skill.warnings.some(item => item.code === 'template-fallback-skill-md')).toBe(false)
  })

  it('continues loading when optional JSON files are invalid', () => {
    write(path.join(directory, 'SKILL.md'), '---\nid: s1\nname: Skill One\n---\n\n正文模板')
    write(path.join(directory, 'template.md'), '模板')
    write(path.join(directory, 'meta.json'), '{bad')
    write(path.join(directory, 'schema.json'), '{bad')

    const result = loadSkillFolder(directory)

    expect(result.ok).toBe(true)
    expect(result.skill.meta).toEqual({})
    expect(result.skill.schema).toBeNull()
    expect(result.skill.warnings.some(item => item.code === 'meta-invalid')).toBe(true)
    expect(result.skill.warnings.some(item => item.code === 'schema-invalid')).toBe(true)
  })

  it('loads evals.json as package-owned evaluation cases', () => {
    const evals = {
      schema: 'shenyi.skill-evals/1',
      cases: [
        { id: 'case-1', input: '测试输入', assertions: [{ type: 'min_length', min: 10 }] }
      ]
    }
    write(path.join(directory, 'SKILL.md'), '---\nid: s1\nname: Skill One\n---\n\n正文模板')
    write(path.join(directory, 'template.md'), '模板')
    write(path.join(directory, 'evals.json'), JSON.stringify(evals))

    const result = loadSkillFolder(directory)

    expect(result.ok).toBe(true)
    expect(result.skill.evals).toEqual(evals)
    expect(result.skill.resources.some(item => item.path === 'evals.json')).toBe(false)
    expect(result.skill.warnings.some(item => item.code === 'evals-invalid')).toBe(false)
  })

  it('degrades invalid evals.json to a warning without blocking the package', () => {
    write(path.join(directory, 'SKILL.md'), '---\nid: s1\nname: Skill One\n---\n\n正文模板')
    write(path.join(directory, 'template.md'), '模板')
    write(path.join(directory, 'evals.json'), '{bad')

    const result = loadSkillFolder(directory)

    expect(result.ok).toBe(true)
    expect(result.skill.evals).toBeNull()
    expect(result.skill.warnings.some(item => item.code === 'evals-invalid')).toBe(true)
    expect(result.skill.resources.some(item => item.path === 'evals.json')).toBe(false)
  })

  it('fully loads declared resources in nested directories', () => {
    write(path.join(directory, 'SKILL.md'), '---\nid: s1\nname: Skill One\n---\n\n正文模板')
    write(path.join(directory, 'template.md'), '模板')
    write(path.join(directory, 'references/world.md'), '世界观资料')
    write(path.join(directory, 'references/characters/hero.md'), '主角资料')
    write(path.join(directory, 'scripts/helper.js'), 'console.log(1)')
    write(path.join(directory, '.hidden/ignored.md'), '隐藏')
    write(path.join(directory, 'ignored.lock'), '锁文件')

    const result = loadSkillFolder(directory)

    expect(result.ok).toBe(true)
    expect(result.skill.resources.map(item => item.path)).toEqual([
      'ignored.lock',
      'references/characters/hero.md',
      'references/world.md',
      'scripts/helper.js'
    ])
    expect(result.skill.resources.find(item => item.path === 'references/world.md').content).toBe('世界观资料')
  })

  it('prefers the explicit skill.json manifest identity and warns on conflicts', () => {
    write(path.join(directory, 'SKILL.md'), '---\nid: markdown-id\nname: Markdown Name\n---\n\n正文模板')
    write(path.join(directory, 'template.md'), '模板')
    write(path.join(directory, 'skill.json'), JSON.stringify({
      id: 'manifest-id',
      name: 'Manifest Name',
      version: '1.2.0',
      compatibility: { shenyi: '>=3.34.0' }
    }))

    const result = loadSkillFolder(directory)

    expect(result.ok).toBe(true)
    expect(result.skill.id).toBe('manifest-id')
    expect(result.skill.name).toBe('Manifest Name')
    expect(result.skill.manifest).toMatchObject({ id: 'manifest-id', version: '1.2.0' })
    expect(result.skill.warnings.some(item => item.code === 'manifest-id-conflict')).toBe(true)
    expect(result.skill.warnings.some(item => item.code === 'manifest-name-conflict')).toBe(true)
  })

  it('keeps the package importable when skill.json is invalid', () => {
    write(path.join(directory, 'SKILL.md'), '---\nid: s1\nname: Skill One\n---\n\n正文模板')
    write(path.join(directory, 'template.md'), '模板')
    write(path.join(directory, 'skill.json'), '{bad')

    const result = loadSkillFolder(directory)

    expect(result.ok).toBe(true)
    expect(result.skill.id).toBe('s1')
    expect(result.skill.manifest).toBeNull()
    expect(result.skill.warnings.some(item => item.code === 'manifest-invalid')).toBe(true)
  })

  it('reports unreadable or oversized resources without failing the package', () => {
    write(path.join(directory, 'SKILL.md'), '---\nid: s1\nname: Skill One\n---\n\n正文模板')
    write(path.join(directory, 'template.md'), '模板')
    write(path.join(directory, 'assets/too-large.txt'), 'x'.repeat(2 * 1024 * 1024 + 1))

    const result = loadSkillFolder(directory)

    expect(result.ok).toBe(true)
    expect(result.skill.resources).toEqual([])
    expect(result.skill.warnings.some(item => item.code === 'resource-too-large')).toBe(true)
  })
})
