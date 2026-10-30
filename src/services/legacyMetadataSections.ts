const META_SECTION_HEADERS = [
  '【来源覆盖】',
  '【状态变化】',
  '【交接清单】',
  '【交接状态】',
  '【正文交接】',
  '【输出末尾元数据】'
] as const

export function splitLegacyMetadataSections(text: string): {
  body: string
  sections: string[]
} {
  const bodyLines: string[] = []
  const sections: string[] = []
  let current: string[] | null = null

  for (const line of String(text || '').split(/\r?\n/)) {
    const heading = findMetaSectionHeading(line)
    if (heading) {
      if (current) sections.push(current.join('\n').trim())
      current = [heading.trimEnd()]
      continue
    }

    if (current) {
      current.push(line)
      if (isMetaSectionEnd(line)) {
        sections.push(current.join('\n').trim())
        current = null
      }
      continue
    }

    bodyLines.push(line)
  }

  if (current) sections.push(current.join('\n').trim())
  return { body: bodyLines.join('\n').trim(), sections }
}

function findMetaSectionHeading(line: string): string | null {
  const trimmed = line.trimStart()
  const header = META_SECTION_HEADERS.find(candidate => trimmed.startsWith(candidate))
  return header ? trimmed : null
}

function isMetaSectionEnd(line: string): boolean {
  return /^【[^】]+结束】\s*$/.test(line.trim())
}
