const fs = require("fs");
const file = "D:/codex/novel-workshop-vue3/src/components/settings/ApiSettings.vue";
let c = fs.readFileSync(file, "utf8");

c = c.replace(
  ".provider-list { display: flex; flex-wrap: wrap; gap: 12px; }",
  ".provider-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: var(--space-md); align-items: stretch; }"
);

c = c.replace(
  ".provider-card {\n  flex: 1 1 300px;\n  min-width: 300px;\n  max-width: 460px;",
  ".provider-card {\n  min-width: 0;\n  max-width: none;"
);

c = c.replace(
  "  min-width: 300px;\n  max-width: 460px;\n  background: var(--bg-card-add, var(--bg-elevated));",
  "  min-width: 0;\n  max-width: none;\n  background: var(--bg-card-add, var(--bg-elevated));"
);

fs.writeFileSync(file, c, "utf8");
console.log("A2 DONE");
