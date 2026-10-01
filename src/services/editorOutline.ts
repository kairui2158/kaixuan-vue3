export interface EditorOutlineHeading {
  id: string
  title: string
  level: number
  line: number
  startOffset: number
}

const HEADING_PATTERN = /^(#{1,6})[ \t]+(.+?)[ \t]*$/

export function computeEditorOutline(content: string): EditorOutlineHeading[] {
  if (typeof content !== 'string' || !content) return []
  const normalized = content.replace(/\r\n?/g, '\n')
  const lines = normalized.split('\n')
  const outline: EditorOutlineHeading[] = []
  let offset = 0

  lines.forEach((line, lineIndex) => {
    const match = HEADING_PATTERN.exec(line)
    if (!match) {
      offset += line.length + 1
      return
    }

    outline.push({
      id: `outline-${lineIndex}-${match[1].length}`,
      title: match[2].trim(),
      level: match[1].length,
      line: lineIndex,
      startOffset: offset,
    })
    offset += line.length + 1
  })

  return outline
}
