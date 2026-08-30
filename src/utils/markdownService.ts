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

export interface MarkdownRenderOptions {
  allowTables?: boolean
}

export function renderMarkdown(text: string, options: MarkdownRenderOptions = {}): string {
  const source = text || ''
  const rawHtml = marked.parse(source, { async: false }) as string
  return sanitizer.sanitize(rawHtml, {
    ALLOWED_TAGS: options.allowTables === false
      ? allowedTags.filter(tag => !['table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td'].includes(tag))
      : allowedTags,
    ALLOWED_ATTR: allowedAttributes,
    FORBID_ATTR: ['style']
  })
}
