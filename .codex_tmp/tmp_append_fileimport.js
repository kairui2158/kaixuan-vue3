const fs = require('fs');
const path = 'D:/codex/novel-workshop-vue3/src/services/file-import.js';
let content = fs.readFileSync(path, 'utf8');

// Check if functions already exist
if (content.includes('App.prototype.importOutlineFile')) {
  console.log('importOutlineFile already exists, skipping');
} else {
  const append = `

// --- App.prototype methods (ported from panels.js) ---

App.prototype.importOutlineFile = function() {
  var inp = document.createElement('input')
  inp.type = 'file'; inp.accept = '.txt,.md,.text,.rtf,.doc,.docx'
  var self = this
  inp.onchange = function() {
    var file = inp.files[0]
    if (!file) return
    var fileName = (file.name || '').toLowerCase()
    if (fileName.endsWith('.txt') || fileName.endsWith('.md') || fileName.endsWith('.text')) {
      var r = new FileReader()
      r.onload = function(e) {
        var buf = new Uint8Array(e.target.result)
        var text = smartDecode(buf)
        document.getElementById('outline-editor').value = text
        self.saveOutlineBlur(); self.updateOWWordCount()
      }
      r.readAsArrayBuffer(file)
      return
    }
    if (fileName.endsWith('.rtf')) {
      var rr = new FileReader()
      rr.onload = function(e) {
        var buf = new Uint8Array(e.target.result)
        var raw = smartDecode(buf)
        var text = raw.replace(/\\\\[a-z]+-?\\d*\\s?/g, '').replace(/[{}]/g, '').replace(/\\\\\\\\/g, '\\\\').replace(/\\\\'/g, "'").trim()
        if (!text || text.length < 5) { self._toast('RTF\u5185\u5bb9\u4e3a\u7a7a', 'error'); return }
        document.getElementById('outline-editor').value = text
        self.saveOutlineBlur(); self.updateOWWordCount()
      }
      rr.readAsArrayBuffer(file)
      return
    }
    if (fileName.endsWith('.docx')) {
      var ra = new FileReader()
      ra.onload = function(e) {
        var docxText = parseDocx(new Uint8Array(e.target.result))
        document.getElementById('outline-editor').value = docxText
        self.saveOutlineBlur(); self.updateOWWordCount()
      }
      ra.readAsArrayBuffer(file)
      return
    }
    if (fileName.endsWith('.doc')) {
      self._toast('.doc\u65e7\u7248\u683c\u5f0f\u4e0d\u652f\u6301\uff0c\u8bf7\u53e6\u5b58\u4e3a.docx\u6216.txt', 'error')
      return
    }
    var rf = new FileReader()
    rf.onload = function(e) {
      var buf = new Uint8Array(e.target.result)
      var text = smartDecode(buf)
      document.getElementById('outline-editor').value = text
      self.saveOutlineBlur(); self.updateOWWordCount()
    }
    rf.readAsArrayBuffer(file)
  }
  inp.click()
}

App.prototype._importDroppedFile = function(file) {
  var self = this
  var fileName = (file.name || '').toLowerCase()
  var ed = document.getElementById('outline-editor')
  if (fileName.endsWith('.txt') || fileName.endsWith('.md') || fileName.endsWith('.text')) {
    var r = new FileReader()
    r.onload = function(e) {
      var buf = new Uint8Array(e.target.result)
      ed.value = smartDecode(buf)
      self.saveOutlineBlur(); self.updateOWWordCount()
    }
    r.readAsArrayBuffer(file)
    return
  }
  if (fileName.endsWith('.rtf')) {
    var rr = new FileReader()
    rr.onload = function(e) {
      var buf = new Uint8Array(e.target.result)
      var raw = smartDecode(buf)
      var text = raw.replace(/\\\\[a-z]+-?\\d*\\s?/g, '').replace(/[{}]/g, '').replace(/\\\\\\\\/g, '\\\\').replace(/\\\\'/g, "'").trim()
      if (!text || text.length < 5) { self._toast('RTF\u5185\u5bb9\u4e3a\u7a7a', 'error'); return }
      ed.value = text
      self.saveOutlineBlur(); self.updateOWWordCount()
    }
    rr.readAsArrayBuffer(file)
    return
  }
  if (fileName.endsWith('.docx')) {
    var ra = new FileReader()
    ra.onload = function(e) {
      var docxText = parseDocx(new Uint8Array(e.target.result))
      ed.value = docxText
      self.saveOutlineBlur(); self.updateOWWordCount()
    }
    ra.readAsArrayBuffer(file)
    return
  }
  if (fileName.endsWith('.doc')) {
    self._toast('.doc\u65e7\u7248\u683c\u5f0f\u4e0d\u652f\u6301\uff0c\u8bf7\u53e6\u5b58\u4e3a.docx\u6216.txt', 'error')
    return
  }
  var rf = new FileReader()
  rf.onload = function(e) {
    var buf = new Uint8Array(e.target.result)
    ed.value = smartDecode(buf)
    self.saveOutlineBlur(); self.updateOWWordCount()
  }
  rf.readAsArrayBuffer(file)
}

App.prototype._parseRepoReadme = function(readme, fullName) {
  var name = fullName.split('/').pop() || fullName
  var description = ''
  var template = ''
  var titleMatch = readme.match(/^#\\s+(.+)/m)
  if (titleMatch) name = titleMatch[1].trim()
  var descMatch = readme.match(/^[^#\\n!\\[\\]`<][^\\n]{20,200}/m)
  if (descMatch) description = descMatch[0].trim()
  var codeMatch = readme.match(/\\`\\`\\`(?:markdown|md|text|yaml|json)?\\s*\\n([\\s\\S]*?)\\n\\`\\`\\`/)
  if (codeMatch) {
    template = codeMatch[1].trim()
  } else {
    template = readme.substring(0, 2000)
  }
  return { name: name, description: description, template: template }
}
`;
  content = content + append;
  fs.writeFileSync(path, content, 'utf8');
  console.log('Appended 3 functions to file-import.js');
}
