const fs = require("fs");

// 修复1: buttons.css 中 btn-primary 的圆角 8px -> 6px
let btnCss = fs.readFileSync("styles/components/buttons.css", "utf8");
// 查找 btn-primary 相关的 8px 圆角
const btnRadiusFixes = btnCss.match(/\.btn-primary[^{]*\{[^}]*border-radius:\s*8px[^}]*\}/g);
if (btnRadiusFixes) {
  btnRadiusFixes.forEach((rule, i) => {
    const fixed = rule.replace(/border-radius:\s*8px/g, "border-radius: var(--radius-btn)");
    btnCss = btnCss.replace(rule, fixed);
    console.log("Fixed btn-primary radius 8px->6px:", i);
  });
}
// 也检查 .btn-sm 圆角
const btnSmFixes = btnCss.match(/\.btn-sm[^{]*\{[^}]*border-radius:\s*8px[^}]*\}/g);
if (btnSmFixes) {
  btnSmFixes.forEach((rule, i) => {
    const fixed = rule.replace(/border-radius:\s*8px/g, "border-radius: var(--radius-btn)");
    btnCss = btnCss.replace(rule, fixed);
    console.log("Fixed btn-sm radius 8px->6px:", i);
  });
}
fs.writeFileSync("styles/components/buttons.css", btnCss, "utf8");

// 修复2: style.css 中 theme-toggle 的圆角 8px -> 6px
let css = fs.readFileSync("style.css", "utf8");
// 查找 theme-toggle 相关规则
const themeTogglePattern = /\.theme-toggle[^{]*\{[^}]*border-radius:\s*8px[^}]*\}/g;
const themeMatches = css.match(themeTogglePattern);
if (themeMatches) {
  themeMatches.forEach((rule, i) => {
    const fixed = rule.replace(/border-radius:\s*8px/g, "border-radius: 6px");
    css = css.replace(rule, fixed);
    console.log("Fixed theme-toggle radius 8px->6px:", i);
  });
}

// 修复3: inline-menu-btn 高度 26px -> 28px (btn-xs标准)
const inlineMenuPattern = /\.inline-menu-btn[^{]*\{[^}]*height:\s*26px[^}]*\}/g;
const inlineMatches = css.match(inlineMenuPattern);
if (inlineMatches) {
  inlineMatches.forEach((rule, i) => {
    const fixed = rule.replace(/height:\s*26px/g, "height: 28px").replace(/width:\s*26px/g, "width: 28px");
    css = css.replace(rule, fixed);
    console.log("Fixed inline-menu-btn 26px->28px:", i);
  });
}

// 修复4: provider-card-edit 纳入按钮系统
// 检查是否已有定义
if (!css.includes(".provider-card-edit") && !btnCss.includes(".provider-card-edit")) {
  // 在 buttons.css 中添加 provider-card-edit 规则
  btnCss += "\n/* 供应商卡片编辑按钮 - 纳入按钮系统 */\n.provider-card-edit { height: var(--btn-md-height); padding: 4px 8px; border-radius: var(--radius-btn); font-size: var(--font-size-sm); background: var(--accent-dim); color: var(--accent); border: 1px solid var(--accent); cursor: pointer; transition: 0.12s ease; display: inline-flex; align-items: center; justify-content: center; }\n.provider-card-edit:hover { background: var(--accent); color: var(--text-on-accent); }\n";
  fs.writeFileSync("styles/components/buttons.css", btnCss, "utf8");
  console.log("Added provider-card-edit to buttons.css");
}

// 修复5: pl-nav-btn 纳入按钮系统
if (!btnCss.includes(".pl-nav-btn")) {
  btnCss += "\n/* 流水线导航按钮 - 纳入按钮系统 */\n.pl-nav-btn { height: var(--btn-md-height); padding: var(--btn-md-padding); border-radius: var(--radius-btn); font-size: var(--font-size-sm); border: 1px solid var(--border-color); background: var(--bg-tertiary); color: var(--text-secondary); cursor: pointer; transition: 0.12s ease; display: inline-flex; align-items: center; justify-content: center; gap: var(--space-xs); }\n.pl-nav-btn:hover { background: var(--accent-dim); color: var(--accent); border-color: var(--accent); }\n.pl-nav-btn:disabled { opacity: 0.5; cursor: not-allowed; }\n";
  fs.writeFileSync("styles/components/buttons.css", btnCss, "utf8");
  console.log("Added pl-nav-btn to buttons.css");
}

fs.writeFileSync("style.css", css, "utf8");

// 验证
const openB = (btnCss.match(/{/g) || []).length;
const closeB = (btnCss.match(/}/g) || []).length;
const openS = (css.match(/{/g) || []).length;
const closeS = (css.match(/}/g) || []).length;
console.log("\nbuttons.css brackets:", openB + "/" + closeB, "balanced:", openB === closeB);
console.log("style.css brackets:", openS + "/" + closeS, "balanced:", openS === closeS);
console.log("buttons.css lines:", btnCss.split("\n").length);
console.log("style.css lines:", css.split("\n").length);
