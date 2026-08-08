const fs = require("fs");
let css = fs.readFileSync("style.css", "utf8");
const before = css.split("\n").length;

// 需要删除的残留旧规则模式（更精准的匹配）
const patterns = [
  // 带父选择器的 btn 规则（如 .sc-attr-row .btn-sm）
  /^\s*\.[a-z-]+\s+\.btn-[a-z]+\s*[{,]/,
  // :is(.btn-primary...) 这种组合选择器
  /^\s*:is\(\.btn-/,
  // .btn-primary:not(:disabled) 这种状态选择器
  /^\s*\.btn-[a-z]+:not\(/,
  // button:not(:disabled) 通用按钮状态
  /^\s*button:not\(:disabled\)/,
  // .btn-*:hover/:active/:focus 等（buttons.css已包含状态）
  /^\s*\.btn-[a-z]+:(hover|active|focus)/,
  // .btn-*[属性] 选择器
  /^\s*\.btn-[a-z]+\[/,
  // 组合 .btn-primary, .btn-secondary 选择器组
  /^\s*\.btn-[a-z]+,\s*\.btn-/,
];

const lines = css.split("\n");
const result = [];
let deleted = 0;
let i = 0;

while (i < lines.length) {
  const line = lines[i];
  const trimmed = line.trim();
  
  // 跳过注释
  if (trimmed.startsWith("/*") || trimmed.startsWith("*") || trimmed.startsWith("*/")) {
    result.push(line);
    i++;
    continue;
  }
  
  let shouldDelete = false;
  for (const p of patterns) {
    if (p.test(line)) {
      shouldDelete = true;
      break;
    }
  }
  
  if (shouldDelete) {
    // 找到规则块结束
    let braceLine = i;
    while (braceLine < lines.length && !lines[braceLine].includes("{")) {
      // 如果遇到 ; 或下一个选择器，说明不是规则块
      if (lines[braceLine].includes(";") && !lines[braceLine].includes("{")) {
        // 单行声明，删除这一行
        break;
      }
      braceLine++;
    }
    if (braceLine < lines.length && lines[braceLine].includes("{")) {
      let depth = 0;
      let end = braceLine;
      while (end < lines.length) {
        for (const ch of lines[end]) {
          if (ch === "{") depth++;
          if (ch === "}") depth--;
        }
        if (depth <= 0 && lines[end].includes("}")) break;
        end++;
      }
      deleted++;
      i = end + 1;
      continue;
    } else {
      // 单行，删除
      deleted++;
      i++;
      continue;
    }
  }
  
  result.push(line);
  i++;
}

const cleaned = result.join("\n").replace(/\n{4,}/g, "\n\n\n");
fs.writeFileSync("style.css", cleaned, "utf8");
const open = (cleaned.match(/{/g) || []).length;
const close = (cleaned.match(/}/g) || []).length;
const important = (cleaned.match(/!important/g) || []).length;
console.log("before:", before, "after:", cleaned.split("\n").length, "deleted:", deleted);
console.log("brackets:", open + "/" + close, "balanced:", open === close);
console.log("!important remaining:", important);
