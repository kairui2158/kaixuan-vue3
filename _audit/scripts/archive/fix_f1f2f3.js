const fs = require("fs");

// F1: ChatMessage bubble font-size md->lg (13px->15px)
const f1 = "D:/codex/novel-workshop-vue3/src/components/chat/ChatMessage.vue";
let c1 = fs.readFileSync(f1, "utf8");n// message-content font-size
c1 = c1.replace(/\.message-content \{[^}]*font-size: var\(--font-size-md\)[^}]*\}/, m => m.replace("var(--font-size-md)", "var(--font-size-lg)"));
// code block font-size
c1 = c1.replace("padding: 12px; font-size: var(--font-size-md); line-height: 1.6;", "padding: 12px; font-size: var(--font-size-lg); line-height: 1.6;");
// table font-size
c1 = c1.replace("border-collapse: collapse; margin: 8px 0; width: 100%; font-size: var(--font-size-md);", "border-collapse: collapse; margin: 8px 0; width: 100%; font-size: var(--font-size-lg);");
fs.writeFileSync(f1, c1, "utf8");
console.log("F1 DONE");

// F2: ChapterTree chapter-item font-size xs->sm (11px->12px)
const f2 = "D:/codex/novel-workshop-vue3/src/components/sidebar/ChapterTree.vue";
let c2 = fs.readFileSync(f2, "utf8");
c2 = c2.replace(".chapter-item[data-v-00e80dea]{cursor:pointer;border-radius:var(--radius-xs);font-size:var(--font-size-xs)", ".chapter-item[data-v-00e80dea]{cursor:pointer;border-radius:var(--radius-xs);font-size:var(--font-size-sm)");
// Also catch non-scoped version
c2 = c2.replace(".chapter-item { padding: 3px 8px; cursor: pointer; border-radius: var(--radius-xs); font-size: var(--font-size-xs);", ".chapter-item { padding: 3px 8px; cursor: pointer; border-radius: var(--radius-xs); font-size: var(--font-size-sm);");
// Also catch any remaining font-size-xs in chapter-item
c2 = c2.replace(/(\.chapter-item[^}]*?)font-size:\s*var\(--font-size-xs\)/g, "$1font-size: var(--font-size-sm)");
fs.writeFileSync(f2, c2, "utf8");
console.log("F2 DONE");

// F3: AgentProgressPanel font-size xs->sm (line 104)
const f3 = "D:/codex/novel-workshop-vue3/src/components/sidebar/AgentProgressPanel.vue";
let c3 = fs.readFileSync(f3, "utf8");
c3 = c3.replace(/font-size:\s*var\(--font-size-xs\)/g, "font-size: var(--font-size-sm)");
fs.writeFileSync(f3, c3, "utf8");
console.log("F3 DONE");
