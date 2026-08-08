const fs = require("fs");
let css = fs.readFileSync("style.css", "utf8");
let changed = 0;

// 修复1: 删除 #settings-modal, #project-modal 等ID选择器的 display:flex
// 这些用ID特异性覆盖了 .modal-hidden 的 display:none
const idModalPattern = /#settings-modal\s*,\s*#project-modal\s*,\s*#new-project-modal\s*,\s*#plugin-market-modal\s*,\s*#sc-bind-modal\s*,\s*#skill-bind-modal\s*,\s*#volume-modal\s*\{[^}]*display:\s*flex[^}]*\}/g;
if (idModalPattern.test(css)) {
  css = css.replace(idModalPattern, (match) => {
    // 移除 display:flex，保留其他属性
    const fixed = match.replace(/display:\s*flex\s*;?/g, "");
    changed++;
    return "/* [R33] Removed display:flex from ID selectors - .modal-hidden in modal-panel.css handles visibility */\n" + fixed;
  });
}

// 修复2: 删除 .btn, .btn-primary, .btn-secondary 的 height:32px !important
const btnHeightPattern = /\.btn\s*,\s*\.btn-primary\s*,\s*\.btn-secondary\s*\{[^}]*height:\s*32px\s*!important[^}]*\}/g;
if (btnHeightPattern.test(css)) {
  css = css.replace(btnHeightPattern, (match) => {
    // 移除 height:32px !important 和其他 !important 声明
    const fixed = match
      .replace(/height:\s*32px\s*!important\s*;?/g, "")
      .replace(/padding:\s*6px\s*16px\s*!important\s*;?/g, "")
      .replace(/border-radius:\s*6px\s*!important\s*;?/g, "")
      .replace(/font-size:\s*13px\s*!important\s*;?/g, "");
    changed++;
    return "/* [R33] Removed !important height/padding/radius/font-size - buttons.css handles these */\n" + fixed;
  });
}

// 修复3: 删除 #btn-tree-gen, #btn-open-project 的 !important
const btnIdPattern = /#btn-tree-gen\s*,\s*#btn-open-project\s*\{[^}]*!important[^}]*\}/g;
if (btnIdPattern.test(css)) {
  css = css.replace(btnIdPattern, (match) => {
    const fixed = match.replace(/!important/g, "");
    changed++;
    return "/* [R33] Removed !important from #btn-tree-gen,#btn-open-project */\n" + fixed;
  });
}

fs.writeFileSync("style.css", css, "utf8");
const open = (css.match(/{/g) || []).length;
const close = (css.match(/}/g) || []).length;
const important = (css.match(/!important/g) || []).length;
console.log("fixes applied:", changed);
console.log("brackets:", open + "/" + close, "balanced:", open === close);
console.log("!important remaining:", important);
console.log("lines:", css.split("\n").length);
