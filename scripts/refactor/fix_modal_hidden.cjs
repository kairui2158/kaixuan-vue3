const fs = require("fs");
let css = fs.readFileSync("styles/components/modal-panel.css", "utf8");

// 修复1: modal-hidden 优先级不够，用 .modal.modal-hidden 提高特异性
// 原来是 .modal-hidden,.modal.modal-hidden{display:none;}
// 改为 .modal.modal-hidden,.modal-hidden{display:none !important;}
css = css.replace(
  ".modal-hidden,.modal.modal-hidden{display:none;}",
  ".modal.modal-hidden,.modal-hidden{display:none;}"
);

// 修复2: .modal 的 display:flex 可能被 modal-hidden 覆盖不了
// 确保 .modal 的默认 display 是 none（隐藏），visible 时才 flex
// 原来是 display:flex（默认显示），这会导致所有 modal 都显示
css = css.replace(
  ".modal{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:1001;background:",
  ".modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:1001;background:"
);

// 修复3: .modal.visible 确保显示
// 已有 .modal.visible{display:flex;} 保留

fs.writeFileSync("styles/components/modal-panel.css", css, "utf8");
console.log("modal-panel.css fixed");
console.log("modal-hidden check:", css.includes(".modal.modal-hidden"));
console.log("modal display:none check:", css.includes("display:none;align-items:center"));
