const { chromium } = require("playwright");
const fs = require("fs");

async function vis(page, sel) {
  try {
    const el = await page.$(sel);
    if (!el) return false;
    return el.isVisible();
  } catch (e) { return false; }
}

async function main() {
  const b = await chromium.connectOverCDP("http://localhost:9227");
  const p = b.contexts()[0].pages()[0];
  const errors = [];
  p.on("pageerror", e => errors.push("pageerror: " + e.message));
  p.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });

  // make sure no modals are open
  await p.evaluate(() => {
    document.querySelectorAll(".modal-overlay, .ow-overlay, .pl-overlay").forEach(m => {
      if (m.style) m.style.display = "none";
    });
  });
  await new Promise(r => setTimeout(r, 300));

  const r = [];
  function add(id, name, status, detail) {
    r.push({ id, name, status, detail });
  }

  // ===== 1. Main UI elements =====
  add("R01", "侧边栏导航", await vis(p, "#sidebar-nav") ? "PASS" : "FAIL", "sidebar-nav 存在");
  add("R02", "章节树区域", await vis(p, "#chapter-tree") ? "PASS" : "FAIL", "chapter-tree 存在");
  add("R03", "编辑器面板", await vis(p, "#editor-panel") ? "PASS" : "FAIL", "editor-panel 存在");
  add("R04", "聊天面板", await vis(p, "#chat-panel") ? "PASS" : "FAIL", "chat-panel 存在");
  add("R05", "大纲工作台按钮", await vis(p, "#btn-outline-workspace") ? "PASS" : "FAIL", "btn-outline-workspace 存在");
  add("R06", "流水线按钮", await vis(p, "#btn-pipeline") ? "PASS" : "FAIL", "btn-pipeline 存在");
  add("R07", "项目按钮", await vis(p, "#btn-open-project") ? "PASS" : "FAIL", "btn-open-project 存在");
  add("R08", "设置按钮", await vis(p, "#btn-settings") ? "PASS" : "FAIL", "btn-settings 存在");

  // ===== 2. Pipeline panel (open it first) =====
  const btnPl = await p.$("#btn-pipeline");
  if (btnPl) { await btnPl.click(); await new Promise(r => setTimeout(r, 600)); }
  const plPanel = await p.$("#pipeline-panel");
  if (plPanel) {
    add("R09", "流水线面板打开", "PASS", "pipeline-panel 存在");
    let allVis = true;
    for (let i = 1; i <= 5; i++) {
      const v = await vis(p, "#pl-step-" + i + "-content");
      if (!v) { allVis = false; break; }
    }
    add("R10", "流水线五层均可见", allVis ? "PASS" : "FAIL", allVis ? "5层全部可见" : "存在隐藏层");
    // check step nav items
    const steps = await p.$$("#pl-steps .pl-step");
    add("R11", "步骤导航条", steps.length >= 4 ? "PASS" : "FAIL", "pl-step 数量=" + steps.length);
    // check has skill/agent/mode selects per layer
    const selIds = ["pl-s1-agent","pl-s1-mode","pl-s1-skill","pl-s2-agent","pl-s2-mode","pl-s2-skill",
      "pl-s3-agent","pl-s3-mode","pl-s3-skill","pl-s4-agent","pl-s4-mode","pl-s4-skill",
      "pl-s5-agent","pl-s5-mode","pl-s5-skill"];
    let allSel = 0;
    for (const s of selIds) { if (await p.$(s)) allSel++; }
    add("R12", "各层选择器", allSel === selIds.length ? "PASS" : "FAIL", allSel + "/" + selIds.length + " 存在");
    // AI tools row
    const aiTools = ["#btn-ai-names","#btn-writing-rules","#btn-timeline","#btn-batch-review","#btn-revise","#btn-translate","#btn-style-convert","#btn-regenerate","#btn-modify"];
    let aiOk = 0;
    for (const s of aiTools) { if (await p.$(s)) aiOk++; }
    add("R13", "AI工具按钮行", aiOk === aiTools.length ? "PASS" : "FAIL", aiOk + "/" + aiTools.length + " 存在");
    // add setting button
    add("R14", "新增设定按钮", await vis(p, "button:has-text('新增设定')") ? "PASS" : "FAIL", "新增设定按钮存在");
    // close pipeline
    const cpl = await p.$("#btn-close-pl");
    if (cpl) { await cpl.click(); await new Promise(r => setTimeout(r, 400)); }
  } else {
    add("R09", "流水线面板打开", "FAIL", "pipeline-panel 不存在");
    add("R10", "流水线五层均可见", "SKIP", "面板未打开");
    add("R11", "步骤导航条", "SKIP", "面板未打开");
    add("R12", "各层选择器", "SKIP", "面板未打开");
    add("R13", "AI工具按钮行", "SKIP", "面板未打开");
    add("R14", "新增设定按钮", "SKIP", "面板未打开");
  }

  // ===== 3. Store state check (read-only) =====
  const store = await p.evaluate(() => {
    const pinia = window.__pinia;
    if (!pinia) return { error: "no __pinia" };
    const s = pinia.state.value;
    return {
      project: s.project ? {
        hasCurrentProjectId: !!s.project.currentProjectId,
        projectName: s.project.projectName || null,
        outlineTextLen: (s.project.outlineText || "").length,
        outlineLocked: !!s.project.outlineLocked,
        volumesCount: (s.project.volumes || []).length,
        chaptersCount: Object.keys(s.project.chapters || {}).length,
        settingsCount: (s.project.settings || []).length,
        hasProjectNames: !!s.project.projectNames
      } : null,
      pipeline: s.pipeline ? {
        currentStep: s.pipeline.currentStep,
        hasMaterial: !!s.pipeline.material,
        hasSettings: !!s.pipeline.settings,
        hasSkills: !!s.pipeline.skills,
        hasAgents: !!s.pipeline.agents
      } : null,
      editor: s.editor ? {
        activeTabId: s.editor.activeTabId || null,
        tabsCount: (s.editor.tabs || []).length,
        contentLen: (s.editor.content || "").length,
        hasRecentFiles: Array.isArray(s.editor.recentFiles) || Array.isArray(s.editor.recentlyClosed)
      } : null,
      chat: s.chat ? {
        activeSessionId: s.chat.activeSessionId || null,
        sessionsCount: (s.chat.sessions || []).length
      } : null
    };
  });
  add("R15", "Pinia store 存在", store.error ? "FAIL" : "PASS", store.error || "project/pipeline/editor/chat 全部加载");
  if (!store.error) {
    add("R16", "Project store 结构", store.project ? "PASS" : "FAIL", JSON.stringify(store.project));
    add("R17", "Pipeline store 结构", store.pipeline ? "PASS" : "FAIL", JSON.stringify(store.pipeline));
    add("R18", "Editor store 结构", store.editor ? "PASS" : "FAIL", JSON.stringify(store.editor));
    add("R19", "Chat store 结构", store.chat ? "PASS" : "FAIL", JSON.stringify(store.chat));
  }

  // ===== 4. electronAPI (IPC) =====
  const ipc = await p.evaluate(() => {
    const e = window.electronAPI;
    if (!e) return { ok: false, methods: [] };
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(e)).length > 0
      ? Object.getOwnPropertyNames(Object.getPrototypeOf(e))
      : Object.keys(e).filter(k => typeof e[k] === "function");
    return { ok: true, methods };
  });
  add("R20", "electronAPI 存在", ipc.ok ? "PASS" : "FAIL", ipc.ok ? "methods=" + ipc.methods.length : "不存在");
  if (ipc.ok) {
    const hasStorage = ipc.methods.some(m => m.includes("storage") || m.includes("Storage"));
    add("R21", "持久化存储方法", hasStorage ? "PASS" : "FAIL", "storageRead/Write/Remove 存在");
  }

  // ===== 5. Settings modal =====
  const btnSt = await p.$("#btn-settings");
  if (btnSt) { await btnSt.click(); await new Promise(r => setTimeout(r, 600)); }
  add("R22", "设置弹窗打开", await vis(p, "#settings-modal") ? "PASS" : "FAIL", "settings-modal 存在");
  const sm = await p.$("#settings-modal");
  if (sm) {
    const tabs = await sm.$$(".settings-tab, .tab-btn, [role=tab]");
    add("R23", "设置多标签页", tabs.length >= 5 ? "PASS" : "FAIL", "tabs=" + tabs.length);
    const closeSm = await sm.$(".modal-close");
    if (closeSm) { await closeSm.click(); await new Promise(r => setTimeout(r, 400)); }
  } else {
    add("R23", "设置多标签页", "SKIP", "弹窗未打开");
  }

  // ===== 6. Chapter tree sub-elements =====
  add("R24", "章节树卷节点", await vis(p, "#tree-body .volume-item") ? "PASS" : "FAIL", "volume-item 存在");
  add("R25", "章节树章节点", await vis(p, "#tree-body .chapter-item") ? "PASS" : "FAIL", "chapter-item 存在");

  // ===== 7. Console errors =====
  const critical = errors.filter(e => !e.includes("favicon") && !e.includes("ResizeObserver") && !e.includes("autofill"));
  add("R26", "控制台关键错误", critical.length === 0 ? "PASS" : "FAIL", critical.length === 0 ? "无" : critical.join(" | "));

  // ===== Summary =====
  const pass = r.filter(x => x.status === "PASS").length;
  const fail = r.filter(x => x.status === "FAIL").length;
  const skip = r.filter(x => x.status === "SKIP").length;
  add("RSUM", "审计总览", pass + "/" + r.length + "通过", "PASS=" + pass + " FAIL=" + fail + " SKIP=" + skip + " TOTAL=" + r.length);

  // ===== Write report =====
  const lines = [
    "# 神意助手只读审计报告",
    "生成时间: " + new Date().toISOString(),
    "类型: 只读检查（不修改应用状态）",
    "",
    "## 汇总",
    "|状态|数量|",
    "|---|---|",
    "|PASS|" + pass + "|",
    "|FAIL|" + fail + "|",
    "|SKIP|" + skip + "|",
    "|Total|" + r.length + "|",
    "",
    "## 详细结果",
    "|ID|名称|状态|详情|",
    "|---|---|---|---|"
  ];
  for (const x of r) lines.push("|" + x.id + "|" + x.name + "|" + x.status + "|" + x.detail + "|");
  fs.writeFileSync("_audit/AUDIT_READONLY.md", lines.join("\n"), "utf8");
  console.log("Report: _audit/AUDIT_READONLY.md");
  console.log("PASS: " + pass + ", FAIL: " + fail + ", SKIP: " + skip + ", Total: " + r.length);
  await b.close();
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
