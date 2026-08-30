import { Marked } from 'marked'
import DOMPurify from 'dompurify'

const marked = new Marked({ gfm: true, breaks: true, async: false })

const sanitizer = DOMPurify(window)

const allowedTags = [
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'ul', 'ol', 'li',
  'blockquote',
  'pre', 'code',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  'strong', 'em', 'del', 's',
  'a', 'img', 'span'
]

const allowedAttributes = [
  'href', 'title', 'alt', 'src',
  'class', 'colspan', 'rowspan', 'start'
]

const statusBadges: Record<string, 'is-success' | 'is-warning' | 'is-danger'> = {
  正常: 'is-success',
  健康: 'is-success',
  稳定: 'is-success',
  已完成: 'is-success',
  通过: 'is-success',
  已绑定: 'is-success',
  已锁定: 'is-success',
  警告: 'is-warning',
  偏低: 'is-warning',
  偏高: 'is-warning',
  待确认: 'is-warning',
  未锁定: 'is-warning',
  未启用: 'is-warning',
  缺失: 'is-danger',
  异常: 'is-danger',
  衰退: 'is-danger',
  失败: 'is-danger',
  错误: 'is-danger',
  未覆盖: 'is-danger'
}

export interface MarkdownRenderOptions {
  allowTables?: boolean
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

function normalizePseudoTables(source: string): string {
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

function injectStatusBadges(html: string): string {
  return html.replace(/(<t[dh]\b[^>]*>)([\s\S]*?)(<\/t[dh]>)/gi, (match, open: string, inner: string, close: string) => {
    if (inner.includes('<')) return match
    const status = inner.trim()
    const kind = statusBadges[status]
    if (!kind) return match
    return `${open}<span class="md-status ${kind}">${status}</span>${close}`
  })
}

export function renderMarkdown(text: string, options: MarkdownRenderOptions = {}): string {
  const source = text || ''
  const normalized = normalizePseudoTables(source)
  const rawHtml = marked.parse(normalized, { async: false }) as string
  const sanitizedHtml = sanitizer.sanitize(rawHtml, {
    ALLOWED_TAGS: options.allowTables === false
      ? allowedTags.filter(tag => !['table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td'].includes(tag))
      : allowedTags,
    ALLOWED_ATTR: allowedAttributes,
    FORBID_ATTR: ['style']
  })
  return injectStatusBadges(sanitizedHtml)
}
