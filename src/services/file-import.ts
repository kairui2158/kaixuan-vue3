// File import utilities: smartDecode + parseDocx (ported from old source panels.js)

/**
 * RTF 的 \\'hh 转义按原始字节（0-255）解释，
 * 必须先把字节转成 Latin-1 式字符串再交给 RTF 解析器，
 * 不能先用 smartDecode 把 GBK 字节提前解码成 Unicode。
 */
function bytesToRaw(buf: Uint8Array): string {
  let out = ''
  const chunk = 8192
  for (let i = 0; i < buf.length; i += chunk) {
    const end = Math.min(i + chunk, buf.length)
    for (let j = i; j < end; j++) {
      out += String.fromCharCode(buf[j])
    }
  }
  return out
}

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
    const decompress = (async () => {
      while (true) {
        const r = await reader.read()
        if (r.done) break
        chunks.push(r.value)
      }
      let totalLen = 0
      for (const c of chunks) totalLen += c.length
      const merged = new Uint8Array(totalLen)
      let pos = 0
      for (const c of chunks) { merged.set(c, pos); pos += c.length }
      return extractText(new TextDecoder().decode(merged))
    })()
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('DOCX_DECOMPRESS_TIMEOUT')), 5000)
    )
    return await Promise.race([decompress, timeout])
  } else {
    throw new Error('DOCX_UNSUPPORTED_METHOD_' + docEntry.method)
  }
}

function parseRtfText(raw: string): string {
  const SKIP_WORDS = new Set([
    '*', 'fonttbl', 'colortbl', 'stylesheet', 'info', 'filetbl', 'listtable',
    'listoverridetable', 'revtbl', 'rsidtbl', 'generator', 'pict', 'object',
    'header', 'headerl', 'headerr', 'footer', 'footerl', 'footerr', 'footnote',
    'nonshppict', 'data', 'result', 'xe', 'tc', 'fldinst', 'fldrslt', 'upr', 'ud'
  ]);
  const cp936 = /\\ansicpg936/.test(raw);
  let out = '';
  let pending: number[] = [];
  let skip = false;
  const stack: boolean[] = [];
  let i = 0;

  const flush = () => {
    if (!pending.length) return;
    if (cp936) {
      try {
        out += new TextDecoder('gbk').decode(new Uint8Array(pending));
      } catch {
        out += String.fromCharCode(...pending);
      }
    } else {
      out += String.fromCharCode(...pending);
    }
    pending = [];
  };

  const readControl = (): { name: string; value: number } => {
    i += 1;
    let name = '';
    while (i < raw.length && /[a-zA-Z]/.test(raw[i])) name += raw[i++];
    let sign = 1;
    if (raw[i] === '-') { sign = -1; i += 1; }
    else if (raw[i] === '+') { i += 1; }
    let digits = '';
    while (i < raw.length && /[0-9]/.test(raw[i])) digits += raw[i++];
    if (raw[i] === ' ') i += 1;
    return { name, value: digits ? sign * Number(digits) : 0 };
  };

  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '\\') {
      if (raw[i + 1] === '*') {
        skip = true;
        i += 2;
        continue;
      }
      if (raw[i + 1] === "'") {
        i += 2;
        const hex = raw.slice(i, i + 2);
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          pending.push(parseInt(hex, 16));
          i += 2;
          continue;
        }
        i += 1;
        continue;
      }
      const cw = readControl();
      flush();
      if (skip) continue;
      if (cw.name === 'par' || cw.name === 'line') {
        out += '\n';
        continue;
      }
      if (cw.name === 'tab') {
        out += '\t';
        continue;
      }
      if (cw.name === 'u') {
        let code = cw.value;
        if (code < 0) code += 65536;
        if (code > 0 && code <= 0xffff) out += String.fromCharCode(code);
        if (i < raw.length && raw[i] !== '\\' && raw[i] !== '{' && raw[i] !== '}' && raw[i] !== '\r' && raw[i] !== '\n') {
          i += 1;
        }
        continue;
      }
      if (SKIP_WORDS.has(cw.name)) {
        skip = true;
        continue;
      }
      continue;
    }
    if (ch === '{') {
      flush();
      stack.push(skip);
      i += 1;
      continue;
    }
    if (ch === '}') {
      flush();
      skip = stack.pop() || false;
      i += 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      flush();
      i += 1;
      continue;
    }
    if (!skip) pending.push(ch.charCodeAt(0));
    i += 1;
  }
  flush();
  return out.split('\n').map(line => line.trim()).join('\n').trim();
}

export async function importFile(file: File): Promise<string> {
  const fileName = (file.name || '').toLowerCase()
  const buf = new Uint8Array(await file.arrayBuffer())

  if (fileName.endsWith('.txt') || fileName.endsWith('.md') || fileName.endsWith('.text')) {
    return smartDecode(buf)
  }
  if (fileName.endsWith('.rtf')) {
    return parseRtfText(bytesToRaw(buf))
  }
  if (fileName.endsWith('.docx')) {
    return await parseDocx(buf)
  }
  if (fileName.endsWith('.doc')) {
    throw new Error('.doc 旧版格式不支持，请另存为 .docx、.txt 或 .md')
  }
  return smartDecode(buf)
}
