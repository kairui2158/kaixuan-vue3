const fs = require("fs");
const file = "D:/codex/novel-workshop-vue3/src/components/deai/DeAiModeCard.vue";
let c = fs.readFileSync(file, "utf8");

c = c.replace("padding: 16px;", "padding: var(--space-5);");
c = c.replace(".card-header {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  margin-bottom: 8px;\n}", ".card-header {\n  display: flex;\n  align-items: center;\n  gap: var(--space-3);\n  margin-bottom: var(--space-3);\n}");
c = c.replace(".card-desc {\n  font-size: var(--font-size-sm);\n  color: var(--text-secondary);\n  margin-bottom: 8px;\n  line-height: 1.5;\n}", ".card-desc {\n  font-size: var(--font-size-sm);\n  color: var(--text-secondary);\n  margin-bottom: var(--space-3);\n  line-height: var(--lh-normal);\n}");
c = c.replace(".card-flow {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 4px;\n}", ".card-flow {\n  display: flex;\n  flex-wrap: wrap;\n  gap: var(--space-2);\n}");

fs.writeFileSync(file, c, "utf8");
console.log("A3 DONE");
