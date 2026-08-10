const fs = require("fs");
const p = "D:\\codex\\novel-workshop-vue3\\src\\styles\\global.css";
const existing = fs.readFileSync(p, "utf8");
const css = `

/* === Template Gap Fill: Vue template classes missing from global.css === */

/* DiffModal */
.diff-original, .diff-modified {
  flex: 1;
  padding: 12px;
  overflow-y: auto;
  font-family: var(--font-mono, monospace);
  font-size: var(--font-size-sm);
  white-space: pre-wrap;
  word-break: break-all;
}
.diff-original {
  border-right: 1px solid var(--border-color);
  color: var(--text-secondary);
}

/* MemoryPanel card-grid */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: var(--gap);
}

/* PluginMarket */
.plugin-market-content {
  background: var(--bg);
  padding: var(--space-md);
  max-height: 70vh;
  overflow-y: auto;
}

/* DashboardModal */
.dash-chart {
  width: 100%;
  height: 200px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
  padding: 12px;
}

/* DeAiButton */
.deai-btn-label {
  font-size: var(--font-size-sm);
  font-weight: 500;
  margin-left: 4px;
}

/* PipelinePanel */
.step-name {
  font-size: var(--font-size-sm);
  font-weight: 500;
  color: var(--text-primary);
}
.pl-tools-section {
  margin-top: 12px;
  padding: 12px;
  background: var(--bg-tertiary);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
}
.pl-tools-title {
  font-size: var(--font-size-sm);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 8px;
}
.pl-tools-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
}
.pl-tool-result {
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  padding: 4px 8px;
  background: var(--bg-elevated);
  border-radius: var(--radius-sm);
}
.pl-tool-loading {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--font-size-xs);
  color: var(--text-muted);
}

/* ApiSettings */
.provider-card-name-input {
  background: var(--bg-input);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  font-size: var(--font-size-md);
  font-weight: 600;
  color: var(--text-primary);
  outline: none;
  width: 100%;
}
.provider-card-name-input:focus {
  border-color: var(--accent);
}

/* SidebarNav */
.sidebar-icon {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
`;
fs.writeFileSync(p, existing + css, "utf8");

// Verify brace balance
let depth = 0;
for (const ch of (existing + css)) {
  if (ch === "{") depth++;
  if (ch === "}") depth--;
}
console.log("CSS appended. Brace depth: " + depth + (depth === 0 ? " OK" : " FAIL"));
console.log("File size: " + (existing + css).length + " bytes");
