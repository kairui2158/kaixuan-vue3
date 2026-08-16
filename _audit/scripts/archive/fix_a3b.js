const fs = require("fs");
const file = "D:/codex/novel-workshop-vue3/src/components/settings/DeAiSettings.vue";
let c = fs.readFileSync(file, "utf8");

c = c.replace(".deai-mode-cards { display: flex; gap: var(--space-sm); margin-bottom: var(--space-md); }", ".deai-mode-cards { display: flex; gap: var(--space-3); margin-bottom: var(--space-md); }");

c = c.replace("  gap: 6px;\n  padding: var(--space-sm) var(--space-md);", "  gap: var(--space-3);\n  padding: var(--space-3) var(--space-5);");

c = c.replace(".mode-full-desc { font-size: var(--font-size-md); color: var(--text-secondary); margin: 8px; line-height: 1.5; }", ".mode-full-desc { font-size: var(--font-size-md); color: var(--text-secondary); margin: var(--space-3); line-height: var(--lh-normal); }");

c = c.replace(".mode-flow { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 8px 8px; }", ".mode-flow { display: flex; flex-wrap: wrap; gap: var(--space-2); padding: 0 var(--space-3) var(--space-3); }");

fs.writeFileSync(file, c, "utf8");
console.log("A3B DONE");
