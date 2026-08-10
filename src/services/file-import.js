// file-import.js - File import service for OutlineWorkspace
// Supports: .txt, .md, .text, .rtf, .docx

function smartDecode(buf) {
  var utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf)
  if (utf8.indexOf('\ufffd') === -1) return utf8
  try {
    var gbk = new TextDecoder('gbk', { fatal: false }).decode(buf)
    if (gbk.indexOf('\ufffd') === -1) return gbk
    return gbk
  } catch (ex) {
    return utf8
  }
}

// Parse .docx by extracting text from word/document.xml inside the ZIP
function parseDocx(buf) {
  // DOCX is a ZIP file. We need to find word/document.xml and extract text.
  // Use the browser's DecompressionStream API if available, otherwise fallback to manual ZIP parsing.
  // Manual ZIP parsing: find PK signature, locate word/document.xml entry, inflate it.
  
  // Simple approach: search for the XML content in the binary data
  var text = ''
  var decoder = new TextDecoder('utf-8', { fatal: false })
  
  // Find 'word/document.xml' in the ZIP central directory or local file headers
  var targetName = 'word/document.xml'
  var targetBytes = new TextEncoder().encode(targetName)
  
  // Search through the buffer for the filename
  for (var i = 0; i < buf.length - targetBytes.length; i++) {
    var match = true
    for (var j = 0; j < targetBytes.length; j++) {
      if (buf[i + j] !== targetBytes[j]) { match = false; break }
    }
    if (match) {
      // Found the filename. The local file header starts 30 bytes before the filename.
      // Local file header: PK\x03\x04 (4 bytes), version (2), flags (2), compression (2), modtime (2), moddate (2), crc32 (4), compressedSize (4), uncompressedSize (4), filenameLength (2), extraLength (2)
      var headerOffset = i - 30
      if (headerOffset >= 0 && buf[headerOffset] === 0x50 && buf[headerOffset + 1] === 0x4b) {
        var compression = buf[headerOffset + 8] | (buf[headerOffset + 9] << 8)
        var compressedSize = buf[headerOffset + 18] | (buf[headerOffset + 19] << 8) | (buf[headerOffset + 20] << 16) | (buf[headerOffset + 21] << 24)
        var extraLength = buf[headerOffset + 28] | (buf[headerOffset + 29] << 8)
        var filenameLength = buf[headerOffset + 26] | (buf[headerOffset + 27] << 8)
        var dataOffset = headerOffset + 30 + filenameLength + extraLength
        
        if (compression === 0) {
          // No compression, raw data
          var rawData = buf.slice(dataOffset, dataOffset + compressedSize)
          text = decoder.decode(rawData)
        } else if (compression === 8) {
          // Deflate compression - use DecompressionStream if available
          // Fallback: try to find raw XML by searching for '<' character patterns
          // This is a rough fallback that extracts readable text
          var compressedData = buf.slice(dataOffset, dataOffset + compressedSize)
          // Try DecompressionStream API
          if (typeof DecompressionStream !== 'undefined') {
            // This is async but we handle it below
            return null // Signal async handling needed
          }
          // Manual fallback: scan for XML text patterns in the compressed data
          // This won't work for deflate, so we try a different approach:
          // Search the entire buffer for <w:t> tags which contain text
          text = extractTextFromBuffer(buf, decoder)
        }
      }
      break
    }
  }
  
  if (!text) {
    // Fallback: try to find <w:t> text tags anywhere in the file
    text = extractTextFromBuffer(buf, decoder)
  }
  
  // Parse XML to extract text from <w:t> tags
  return parseWpmlXml(text)
}

function extractTextFromBuffer(buf, decoder) {
  // Decode entire buffer as UTF-8 (lossy) and search for <w:t> tags
  var raw = decoder.decode(buf)
  return raw
}

function parseWpmlXml(xml) {
  if (!xml) return ''
  var text = ''
  // Extract text from <w:t> tags (WordprocessingML text elements)
  var regex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g
  var match
  while ((match = regex.exec(xml)) !== null) {
    text += match[1]
  }
  // Add paragraph breaks
  var paraRegex = /<w:p[ >]/g
  var paraCount = 0
  var lastIndex = 0
  while (paraRegex.exec(xml) !== null) {
    paraCount++
  }
  // Replace <w:p> boundaries with newlines
  xml = xml.replace(/<\/w:p>/g, '\n')
  text = ''
  while ((match = regex.exec(xml)) === null ? false : match) {
    text += match[1]
  }
  // Re-extract with newlines
  var lines = xml.split('</w:p>')
  text = ''
  for (var i = 0; i < lines.length; i++) {
    var lineText = ''
    var lineRegex = /<w:t[^>]*>([\s\S]*?)<\/w:t>/g
    var lm
    while ((lm = lineRegex.exec(lines[i])) !== null) {
      lineText += lm[1]
    }
    if (lineText) {
      text += (text ? '\n' : '') + lineText
    }
  }
  // Decode XML entities
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  return text
}

function parseRtf(text) {
  // Basic RTF to plain text conversion
  return text
    .replace(/\\\\/g, '\\')
    .replace(/\\par[d]?/g, '\n')
    .replace(/\\line/g, '\n')
    .replace(/\\tab/g, '\t')
    .replace(/\\[a-zA-Z]+-?[0-9]*\s?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\\'[0-9a-fA-F]{2}/g, '')
    .trim()
}

export async function importFile(file) {
  var fileName = (file.name || '').toLowerCase()
  
  if (fileName.endsWith('.txt') || fileName.endsWith('.md') || fileName.endsWith('.text')) {
    var buf = new Uint8Array(await file.arrayBuffer())
    return smartDecode(buf)
  }
  
  if (fileName.endsWith('.rtf')) {
    var rtfBuf = new Uint8Array(await file.arrayBuffer())
    var rtfText = smartDecode(rtfBuf)
    return parseRtf(rtfText)
  }
  
  if (fileName.endsWith('.docx')) {
    var docxBuf = new Uint8Array(await file.arrayBuffer())
    
    // Try using DecompressionStream for proper deflate decompression
    if (typeof DecompressionStream !== 'undefined') {
      try {
        // Find word/document.xml in the ZIP
        var targetName = 'word/document.xml'
        var targetBytes = new TextEncoder().encode(targetName)
        var dataOffset = -1
        var compressedSize = 0
        
        for (var i = 0; i < docxBuf.length - targetBytes.length; i++) {
          var match = true
          for (var j = 0; j < targetBytes.length; j++) {
            if (docxBuf[i + j] !== targetBytes[j]) { match = false; break }
          }
          if (match && i >= 30) {
            var headerOffset = i - 30
            if (docxBuf[headerOffset] === 0x50 && docxBuf[headerOffset + 1] === 0x4b) {
              var compression = docxBuf[headerOffset + 8] | (docxBuf[headerOffset + 9] << 8)
              compressedSize = docxBuf[headerOffset + 18] | (docxBuf[headerOffset + 19] << 8) | (docxBuf[headerOffset + 20] << 16) | (docxBuf[headerOffset + 21] << 24)
              var fnLen = docxBuf[headerOffset + 26] | (docxBuf[headerOffset + 27] << 8)
              var exLen = docxBuf[headerOffset + 28] | (docxBuf[headerOffset + 29] << 8)
              dataOffset = headerOffset + 30 + fnLen + exLen
              
              if (compression === 8) {
                // Deflate compressed
                var compressedData = docxBuf.slice(dataOffset, dataOffset + compressedSize)
                var blob = new Blob([compressedData])
                var ds = new DecompressionStream('deflate')
                var stream = blob.stream().pipeThrough(ds)
                var decompressed = await new Response(stream).text()
                return parseWpmlXml(decompressed)
              } else {
                // Stored (no compression)
                var rawData = docxBuf.slice(dataOffset, dataOffset + compressedSize)
                var decoder = new TextDecoder('utf-8')
                return parseWpmlXml(decoder.decode(rawData))
              }
            }
          }
        }
      } catch (e) {
        // Fallback to buffer scan
      }
    }
    
    // Fallback: scan entire buffer for <w:t> tags (lossy but works for simple docx)
    var decoder2 = new TextDecoder('utf-8', { fatal: false })
    var rawText = decoder2.decode(docxBuf)
    return parseWpmlXml(rawText)
  }
  
  if (fileName.endsWith('.doc')) {
    throw new Error('.doc\u65e7\u7248\u683c\u5f0f\u4e0d\u652f\u6301\uff0c\u8bf7\u53e6\u5b58\u4e3a.docx\u6216.txt')
  }
  
  // Fallback: try as text
  var fallbackBuf = new Uint8Array(await file.arrayBuffer())
  return smartDecode(fallbackBuf)
}


// --- App.prototype methods (ported from panels.js) ---
