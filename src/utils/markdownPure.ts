import { Marked } from 'marked'

export const RENDER_PREVIEW_LIMIT = 200000
export const RENDER_PREVIEW_NOTICE = '\n\n[文本超过 20 万字符，已截断预览；复制、插入或导出仍使用完整内容]'

const marked = new Marked({ gfm: true, breaks: true, async: false })

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function isTableSeparator(line: string): boolean {
  const value = line.trim()
  if (!value.includes('|')) return false
  const cells = splitTableRow(value)
  if (cells.length < 2) return false
  return cells.every(cell => /^:?-{1,}:?$/.test(cell.replace(/\s/g, '')))
}

function splitTableRow(line: string): string[] {
  const value = line.trim().replace(/｜/g, '|')
  if (!value.includes('|')) return []
  const cells = value.replace(/^\|+/, '').replace(/\|+$/, '').split('|')
  return cells.map(cell => cell.trim())
}

function normalizeTableLines(lines: string[]): string[] {
  const converted = lines.map(line => line.replace(/｜/g, '|'))
  const counts = converted
    .filter(line => line.includes('|') && !isTableSeparator(line))
    .map(line => splitTableRow(line).length)
  if (converted.length < 2 || counts.length < 2 || counts.some(count => count < 2)) return lines
  const columnCount = counts[0]
  if (counts.some(count => count !== columnCount)) return lines

  const output: string[] = []
  if (!isTableSeparator(converted[1])) {
    output.push(converted[0])
    output.push(`| ${Array.from({ length: columnCount }, () => '---').join(' | ')} |`)
    output.push(...converted.slice(1).filter(line => !isTableSeparator(line)))
  } else {
    output.push(converted[0], converted[1])
    output.push(...converted.slice(2).filter(line => !isTableSeparator(line)))
  }
  return output.map(line => {
    const cells = splitTableRow(line)
    if (isTableSeparator(line)) return `| ${Array.from({ length: columnCount }, () => '---').join(' | ')} |`
    return cells.length === columnCount ? `| ${cells.join(' | ')} |` : line
  })
}

export function normalizePseudoTables(source: string): string {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const output: string[] = []
  let tableStart = -1
  let inFence = false

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (/^\s*(?:```|~~~)/.test(line)) {
      if (tableStart >= 0) {
        output.push(...normalizeTableLines(lines.slice(tableStart, index)))
        tableStart = -1
      }
      output.push(line)
      inFence = !inFence
      continue
    }
    if (inFence) {
      output.push(line)
      continue
    }

    const isTableRow = splitTableRow(line).length >= 3
    if (isTableRow) {
      if (tableStart < 0) tableStart = index
      continue
    }
    if (tableStart >= 0) {
      output.push(...normalizeTableLines(lines.slice(tableStart, index)))
      tableStart = -1
    }
    output.push(line)
  }
  if (tableStart >= 0) output.push(...normalizeTableLines(lines.slice(tableStart)))
  return output.join('\n')
}

export function parseMarkdownHtml(source: string): string {
  const text = source || ''
  if (text.length > RENDER_PREVIEW_LIMIT) {
    const preview = text.slice(0, RENDER_PREVIEW_LIMIT) + RENDER_PREVIEW_NOTICE
    return `<p>${escapeHtml(preview)}</p>`
  }
  return marked.parse(normalizePseudoTables(text), { async: false }) as string
}
