const fs = require("fs");
let css = fs.readFileSync("style.css", "utf8");
const originalLines = css.split("\n").length;

// 需要删除的选择器前缀（被新组件层完全覆盖的）
// 注意：不删除 :root（令牌已在tokens.css重新定义，但保留style.css的:root作为fallback）
// 不删除布局类（.app-main, .sidebar, .chat-area等）
const prefixesToDelete = [
  // 按钮系统（buttons.css已覆盖）
  /^\s*\.btn-primary[\s,.:{]/,
  /^\s*\.btn-primary:/,
  /^\s*\.btn-primary\.[^,{]*[{,]/,
  /^\s*\.btn-secondary[\s,.:{]/,
  /^\s*\.btn-secondary:/,
  /^\s*\.btn-sm[\s,.:{]/,
  /^\s*\.btn-sm:/,
  /^\s*\.btn-xs[\s,.:{]/,
  /^\s*\.btn-md[\s,.:{]/,
  /^\s*\.btn-lg[\s,.:{]/,
  /^\s*\.btn-icon[\s,.:{]/,
  /^\s*\.btn-icon:/,
  /^\s*\.btn-send[\s,.:{]/,
  /^\s*\.btn-send:/,
  /^\s*\.btn-send\./,
  /^\s*\.btn-close[\s,.:{]/,
  /^\s*\.btn-close:/,
  /^\s*\.btn-toggle[\s,.:{]/,
  /^\s*\.btn-toggle:/,
  /^\s*\.btn-var[\s,.:{]/,
  /^\s*\.btn-var:/,
  /^\s*\.btn-ghost[\s,.:{]/,
  /^\s*\.btn-danger[\s,.:{]/,
  /^\s*\.btn-danger:/,
  /^\s*\.btn-outline[\s,.:{]/,
  /^\s*\.btn-back-sm[\s,.:{]/,
  /^\s*\.sidebar-btn[\s,.:{]/,
  /^\s*\.sidebar-btn:/,
  // 弹窗面板系统（modal-panel.css已覆盖）
  /^\s*\.modal[\s,.{]/,
  /^\s*\.modal:/,
  /^\s*\.modal\.[^,{]*[{,]/,
  /^\s*\.modal-content[\s,.:{]/,
  /^\s*\.modal-content\./,
  /^\s*\.modal-header[\s,.:{]/,
  /^\s*\.modal-body[\s,.:{]/,
  /^\s*\.modal-footer[\s,.:{]/,
  /^\s*\.modal-backdrop[\s,.:{]/,
  /^\s*\.modal-overlay[\s,.:{]/,
  /^\s*\.modal-actions[\s,.:{]/,
  /^\s*\.modal-close[\s,.:{]/,
  /^\s*\.modal-hidden[\s,.:{]/,
  /^\s*\.modal-tabs[\s,.:{]/,
  /^\s*\.modal-tab[\s,.:{]/,
  /^\s*\.modal-tab:/,
  /^\s*\.modal-tab\./,
  /^\s*\.modal-title-bar[\s,.:{]/,
  /^\s*\.modal-content-sm[\s,.:{]/,
  /^\s*\.card[\s,.{]/,
  /^\s*\.card:/,
  /^\s*\.card\.[^,{]*[{,]/,
  /^\s*\.card-grid[\s,.:{]/,
  /^\s*\.item-card[\s,.:{]/,
  /^\s*\.card-item[\s,.:{]/,
  /^\s*\.setting-card[\s,.:{]/,
  /^\s*\.skill-card[\s,.:{]/,
  /^\s*\.agent-card[\s,.:{]/,
  /^\s*\.panel[\s,.{]/,
  /^\s*\.panel:/,
  /^\s*\.panel\.[^,{]*[{,]/,
  /^\s*\.panel-header[\s,.:{]/,
  /^\s*\.panel-body[\s,.:{]/,
  /^\s*\.panel-title[\s,.:{]/,
  /^\s*\.panel-actions[\s,.:{]/,
  /^\s*\.panel-scroll[\s,.:{]/,
  /^\s*\.overlay-panel[\s,.:{]/,
  // 表单系统（form-editor.css已覆盖）
  /^\s*\.form-group[\s,.:{]/,
  /^\s*\.form-group:/,
  /^\s*\.form-actions[\s,.:{]/,
  /^\s*\.form-hint[\s,.:{]/,
  /^\s*\.form-label[\s,.:{]/,
  /^\s*\.input-hint[\s,.:{]/,
  /^\s*\.input-w-\d+[\s,.:{]/,
  // 编辑器/工具栏/标签页/树（form-editor.css已覆盖）
  /^\s*\.editor-toolbar[\s,.:{]/,
  /^\s*\.editor-toolbar:/,
  /^\s*\.editor-toolbar\.[^,{]*[{,]/,
  /^\s*\.editor-toolbar-group[\s,.:{]/,
  /^\s*\.editor-toolbar-sep[\s,.:{]/,
  /^\s*\.editor-header[\s,.:{]/,
  /^\s*\.tab-content[\s,.:{]/,
  /^\s*\.tab-content:/,
  /^\s*\.tab-content\./,
  /^\s*\.tab-hidden[\s,.:{]/,
  /^\s*\.tree-header[\s,.:{]/,
  /^\s*\.tree-body[\s,.:{]/,
  /^\s*\.chat-header[\s,.:{]/,
  /^\s*\.chat-input-row[\s,.:{]/,
  /^\s*\.header-selector[\s,.:{]/,
  /^\s*\.header-left[\s,.:{]/,
  /^\s*\.header-right[\s,.:{]/,
  /^\s*\.sidebar-divider[\s,.:{]/,
];

// 逐行扫描，删除匹配的规则块
const lines = css.split("\n");
const result = [];
let skipDepth = 0;
let deletedBlocks = 0;
let i = 0;

while (i < lines.length) {
  const line = lines[i];
  const trimmed = line.trim();
  
  // 跳过注释行
  if (trimmed.startsWith("/*") || trimmed.startsWith("*") || trimmed.startsWith("*/")) {
    result.push(line);
    i++;
    continue;
  }
  
  // 检查是否匹配删除前缀
  let shouldDelete = false;
  for (const prefix of prefixesToDelete) {
    if (prefix.test(line)) {
      shouldDelete = true;
      break;
    }
  }
  
  if (shouldDelete) {
    // 找到规则块开始，删除到对应的 }
    // 先检查这一行是否有 {
    let blockStart = i;
    let foundBrace = false;
    let j = i;
    while (j < lines.length) {
      if (lines[j].includes("{")) {
        foundBrace = true;
        break;
      }
      // 如果遇到 } 或下一个选择器，说明是单行或多选择器
      if (lines[j].includes("}") && !foundBrace) {
        break;
      }
      j++;
    }
    
    if (foundBrace) {
      // 找到匹配的 }
      let depth = 0;
      let endLine = j;
      while (endLine < lines.length) {
        for (const ch of lines[endLine]) {
          if (ch === "{") depth++;
          if (ch === "}") depth--;
        }
        if (depth <= 0 && lines[endLine].includes("}")) {
          break;
        }
        endLine++;
      }
      // 删除从 blockStart 到 endLine
      deletedBlocks++;
      i = endLine + 1;
      continue;
    } else {
      // 可能是多选择器同行如 .btn-primary, .btn-secondary { }
      // 找到 { 所在行
      let braceLine = i;
      while (braceLine < lines.length && !lines[braceLine].includes("{")) {
        braceLine++;
      }
      if (braceLine < lines.length) {
        let depth = 0;
        let endLine = braceLine;
        while (endLine < lines.length) {
          for (const ch of lines[endLine]) {
            if (ch === "{") depth++;
            if (ch === "}") depth--;
          }
          if (depth <= 0 && lines[endLine].includes("}")) {
            break;
          }
          endLine++;
        }
        deletedBlocks++;
        i = endLine + 1;
        continue;
      }
    }
  }
  
  result.push(line);
  i++;
}

const newCss = result.join("\n");
const newLines = newCss.split("\n").length;

// 清理多余空行（连续3个以上空行变2个）
const cleaned = newCss.replace(/\n{4,}/g, "\n\n\n");

fs.writeFileSync("style.css", cleaned, "utf8");

// 验证括号平衡
const open = (cleaned.match(/{/g) || []).length;
const close = (cleaned.match(/}/g) || []).length;
const important = (cleaned.match(/!important/g) || []).length;

console.log("=== Cleanup Results ===");
console.log("Original lines:", originalLines);
console.log("New lines:", cleaned.split("\n").length);
console.log("Deleted blocks:", deletedBlocks);
console.log("Brackets:", open + "/" + close, "balanced:", open === close);
console.log("Remaining !important:", important);
