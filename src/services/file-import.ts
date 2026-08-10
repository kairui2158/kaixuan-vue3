// File import utilities: smartDecode + parseDocx (ported from old source panels.js)

export function smartDecode(buf: Uint8Array): string {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf)
  if (utf8.indexOf('�') === -1) return utf8
  try {
    const gbk = new TextDecoder('gbk', { fatal: false }).decode(buf)
    if (gbk.indexOf('�') === -1) return gbk
    return gbk
  } catch {
    return utf8
  }
}

export async function parseDocx(buf: Uint8Array): Promise<string> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  function rd16(o: number) { return dv.getUint16(o, true) }
  function rd32(o: number) { return dv.getUint32(o, true) }

  // Find EOCD signature
  let eocdOff = -1
  for (let scan = buf.byteLength - 22; scan >= 0; scan--) {
    if (scan + 22 <= buf.byteLength && rd32(scan) === 0x06054b50) { eocdOff = scan; break }
  }
  if (eocdOff < 0) throw new Error('DOCX_ZIP_ERROR')

  const cdEntries = rd16(eocdOff + 10)
  const cdOffset = rd32(eocdOff + 16)
  let docEntry: { method: number; data: Uint8Array; size: number } | null = null
  let cdOff = cdOffset

  for (let ci = 0; ci < cdEntries; ci++) {
    if (cdOff + 46 > buf.byteLength || rd32(cdOff) !== 0x02014b50) break
    const cdMethod = rd16(cdOff + 10)
    const cdCompSize = rd32(cdOff + 20)
    const cdFnLen = rd16(cdOff + 28)
    const cdEfLen = rd16(cdOff + 30)
    const cdCommentLen = rd16(cdOff + 32)
    const cdLocalOff = rd32(cdOff + 42)
    const cdFnStart = cdOff + 46
    const cdFnEnd = cdFnStart + cdFnLen
    if (cdFnEnd > buf.byteLength) break
    const cdName = new TextDecoder().decode(buf.subarray(cdFnStart, cdFnEnd))
    if (cdName === 'word/document.xml') {
      const localFnLen = rd16(cdLocalOff + 26)
      const localEfLen = rd16(cdLocalOff + 28)
      const dataStart = cdLocalOff + 30 + localFnLen + localEfLen
      docEntry = { method: cdMethod, data: buf.subarray(dataStart, dataStart + cdCompSize), size: cdCompSize }
      break
    }
    cdOff = cdFnEnd + cdEfLen + cdCommentLen
  }
  if (!docEntry) throw new Error('DOCX_NO_CONTENT')

  function extractText(xmlStr: string): string {
    function decEntities(s: string): string {
      return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    }
    const lines: string[] = []
    const paras = xmlStr.split(/<w:p[\s>]/)
    for (let i = 1; i < paras.length; i++) {
      let para = paras[i]
      const endIdx = para.indexOf('</w:p>')
      if (endIdx >= 0) para = para.substring(0, endIdx)
      const tParts: string[] = []
      const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g
      let m: RegExpExecArray | null
      while ((m = re.exec(para)) !== null) { tParts.push(decEntities(m[1])) }
      if (tParts.length > 0) lines.push(tParts.join(''))
    }
    return lines.join('\n')
  }

  if (docEntry.method === 0) {
    return extractText(new TextDecoder().decode(docEntry.data))
  } else if (docEntry.method === 8) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('DOCX_NO_DECOMPRESS')
    }
    const blob = new Blob([docEntry.data])
    const reader = blob.stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader()
    const chunks: Uint8Array[] = []
    while (true) {
      const r = await reader.read()
      if (r.done) {
        let totalLen = 0
        for (const c of chunks) totalLen += c.length
        const merged = new Uint8Array(totalLen)
        let pos = 0
        for (const c of chunks) { merged.set(c, pos); pos += c.length }
        return extractText(new TextDecoder().decode(merged))
      }
      chunks.push(r.value)
    }
  } else {
    throw new Error('DOCX_UNSUPPORTED_METHOD_' + docEntry.method)
  }
}

export async function importFile(file: File): Promise<string> {
  const fileName = (file.name || '').toLowerCase()
  const buf = new Uint8Array(await file.arrayBuffer())

  if (fileName.endsWith('.txt') || fileName.endsWith('.md') || fileName.endsWith('.text')) {
    return smartDecode(buf)
  }
  if (fileName.endsWith('.rtf')) {
    const raw = smartDecode(buf)
    const text = raw.replace(/\\[a-z]+-?\d*\s?/g, '').replace(/[{}]/g, '').replace(/\\\\/g, '\\').replace(/\\'/g, "'").trim()
    if (!text || text.length < 5) throw new Error('RTF_EMPTY')
    return text
  }
  if (fileName.endsWith('.docx')) {
    return await parseDocx(buf)
  }
  if (fileName.endsWith('.doc')) {
    throw new Error('DOC_LEGACY_NOT_SUPPORTED')
  }
  return smartDecode(buf)
}
