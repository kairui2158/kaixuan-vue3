const {chromium} = require("playwright");
const fs = require("fs");

async function closeAllModals(p) {
  await p.evaluate(() => {
    document.querySelectorAll(".modal-overlay").forEach(m => {
      const cb = m.querySelector(".modal-close, .btn-close, button.close");
      if (cb) cb.click();
    });
  });
  await new Promise(r => setTimeout(r, 400));
}

async function visOf(p, sel) {
  return p.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return { exists: false };
    const style = getComputedStyle(el);
    return {
      exists: true,
      visible: style.display !== "none" && style.visibility !== "hidden" && el.offsetParent !== null,
      display: style.display,
      visibility: style.visibility
    };
  }, sel);
}

async function main() {
  const b = await chromium.connectOverCDP("http://localhost:9227");
  const p = b.contexts()[0].pages()[0];
  await closeAllModals(p);
  const r = [];
  const cdplog = [];

  function add(id, name, status, detail) {
    r.push({ id, name, status, detail });
    cdplog.push("[" + status + "] " + name + ": " + detail);
  }

  cdplog.push("=== CDP LOG START ===");
  cdplog.push("page: " + p.url());

  const t = await p.title();
  add("P1", "页面标题", t === "神意助手" ? "PASS" : "FAIL", "标题: " + t);

  const dom = await p.evaluate(() => ({
    app: !!document.querySelector("#app"),
    sidebar: !!document.querySelector(".sidebar-nav"),
    tree: !!document.querySelector("#chapter-tree"),
    editor: !!document.querySelector("#editor-panel"),
    chat: !!document.querySelector("#chat-panel")
  }));
  add("P2", "App根节点", dom.app ? "PASS" : "FAIL", "存在");
  add("P3", "侧边栏(sidebar-nav)", dom.sidebar ? "PASS" : "FAIL", "存在");
  add("P4", "章节树", dom.tree ? "PASS" : "FAIL", "存在");
  add("P5", "编辑器", dom.editor ? "PASS" : "FAIL", "存在");
  add("P6", "聊天面板", dom.chat ? "PASS" : "FAIL", "存在");

  const api = await p.evaluate(() => window.electronAPI ? Object.keys(window.electronAPI).length : 0);
  add("P7", "electronAPI", api >= 20 ? "PASS" : "FAIL", api + " methods");

  const pinia = await p.evaluate(() => window.__pinia ? Object.keys(window.__pinia.state.value || {}) : null);
  add("P8", "Pinia stores", pinia ? "PASS" : "FAIL", pinia ? pinia.join(",") : "不可访问");

  await p.screenshot({ path: "_audit/screenshots/00_initial.png", fullPage: true });

  const sels = ["#btn-outline-workspace", "#btn-pipeline", "#btn-memory", "#btn-plugin-market", "#btn-settings", "#btn-dashboard", "#theme-toggle-btn", "#btn-settings-collection"];
  for (const sel of sels) {
    const v = await visOf(p, sel);
    add("SB:" + sel, "侧边栏" + sel, v.exists && v.visible ? "PASS" : "FAIL", v.exists ? (v.visible ? "可见" : "不可见") : "DOM中不存在");
  }

  cdplog.push("--- Click btn-outline-workspace ---");
  const ow = await p.$("#btn-outline-workspace");
  if (ow) { await ow.click(); await new Promise(r => setTimeout(r, 500)); }
  await p.screenshot({ path: "_audit/screenshots/01_outline.png", fullPage: true });

  for (const bb of ["#btn-import-outline", "#btn-save-outline", "#btn-lock-outline", "#btn-ai-co-create", "#btn-export-outline-md", "#btn-export-outline-txt", "#btn-generate-outline-skills", "#btn-close-outline-workspace"]) {
    const v = await visOf(p, bb);
    add("OW:" + bb, "大纲" + bb, v.exists && v.visible ? "PASS" : "FAIL", v.exists ? (v.visible ? "可见" : "不可见") : "DOM中不存在");
  }

  const owc = await p.$("#btn-close-outline-workspace");
  if (owc) { await owc.click(); await new Promise(r => setTimeout(r, 300)); }
  await closeAllModals(p);

  cdplog.push("--- Click btn-pipeline ---");
  const pl = await p.$("#btn-pipeline");
  if (pl) { await pl.click(); await new Promise(r => setTimeout(r, 500)); }
  await p.screenshot({ path: "_audit/screenshots/02_pipeline.png", fullPage: true });

  for (let i = 1; i <= 5; i++) {
    const v = await visOf(p, "#pl-step-" + i + "-content");
    add("PL:step" + i, "流水线第" + i + "层", v.exists && v.visible ? "PASS" : "FAIL", v.exists ? (v.visible ? "可见" : "不可见") : "DOM中不存在");
  }

  const plbtns = {
    "#btn-pl-confirm-outline": "确认大纲",
    "#btn-pl-gen-settings": "AI生成设定",
    "#btn-pl-save-settings": "保存设定",
    "#btn-pl-confirm-settings": "确认设定",
    "#btn-pl-gen-volumes": "AI生成全卷",
    "#btn-pl-gen-single-volume": "逐卷生成",
    "#btn-pl-create-volumes": "自动卷纲",
    "#btn-pl-continue-volumes": "续生成",
    "#btn-pl-confirm-volumes": "确认卷纲",
    "#btn-pl-gen-chapters": "AI生成章节",
    "#btn-pl-autogen-chapters": "自动章节",
    "#btn-pl-confirm-chapters": "确认章节",
    "#btn-pl-gen-body": "AI生成正文",
    "#btn-pl-insert-body": "插入编辑器",
    "#btn-pl-confirm-body": "确认正文"
  };
  for (const [sel, label] of Object.entries(plbtns)) {
    const v = await visOf(p, sel);
    add("PL:" + sel, "流水线" + label, v.exists && v.visible ? "PASS" : "FAIL", v.exists ? (v.visible ? "可见" : "不可见") : "DOM中不存在");
  }

  for (const sel of ["#btn-ai-names", "#btn-writing-rules", "#btn-timeline", "#btn-batch-review", "#btn-revise", "#btn-translate", "#btn-style-convert", "#btn-regenerate", "#btn-modify"]) {
    const v = await visOf(p, sel);
    add("PL:ai:" + sel, "AI工具" + sel, v.exists && v.visible ? "PASS" : "FAIL", v.exists ? (v.visible ? "可见" : "不可见") : "DOM中不存在");
  }
  await p.screenshot({ path: "_audit/screenshots/03_pipeline_buttons.png", fullPage: true });

  const plc = await p.$("#btn-close-pl");
  if (plc) { await plc.click(); await new Promise(r => setTimeout(r, 300)); }
  await closeAllModals(p);

  cdplog.push("--- Click btn-settings-collection ---");
  const sc = await p.$("#btn-settings-collection");
  if (sc) { await sc.click(); await new Promise(r => setTimeout(r, 500)); }
  await p.screenshot({ path: "_audit/screenshots/04_settings_collection.png", fullPage: true });
  const scp = await p.$("#settings-collection-panel");
  add("SC", "设定合集面板", scp ? "PASS" : "FAIL", scp ? "存在" : "不存在");
  if (scp) { const scc = await scp.$(".modal-close"); if (scc) await scc.click(); await new Promise(r => setTimeout(r, 300)); }
  await closeAllModals(p);

  cdplog.push("--- Click btn-open-project ---");
  const pj = await p.$("#btn-open-project");
  if (pj) { await pj.click(); await new Promise(r => setTimeout(r, 500)); }
  await p.screenshot({ path: "_audit/screenshots/05_project.png", fullPage: true });
  const pm = await p.$(".modal-content.project-modal-content");
  add("PM", "项目弹窗", pm ? "PASS" : "FAIL", pm ? "存在" : "不存在");
  if (pm) {
    const pmVis = await p.evaluate(() => {
      const el = document.querySelector(".modal-content.project-modal-content");
      if (!el) return false;
      const style = getComputedStyle(el);
      return style.display !== "none" && style.visibility !== "hidden" && el.offsetParent !== null;
    });
    add("PM:vis", "项目弹窗可见", pmVis ? "PASS" : "FAIL", pmVis ? "可见" : "不可见");
  }
  if (pm) { const pmc = await pm.$(".btn-close"); if (pmc) await pmc.click(); await new Promise(r => setTimeout(r, 300)); }
  await closeAllModals(p);

  cdplog.push("--- Click btn-settings ---");
  const sm = await p.$("#btn-settings");
  if (sm) { await sm.click(); await new Promise(r => setTimeout(r, 500)); }
  await p.screenshot({ path: "_audit/screenshots/06_settings.png", fullPage: true });
  const smp = await p.$("#settings-modal");
  add("SM", "设置弹窗", smp ? "PASS" : "FAIL", smp ? "存在" : "不存在");
  if (smp) { const smc = await smp.$(".modal-close"); if (smc) await smc.click(); await new Promise(r => setTimeout(r, 300)); }
  await closeAllModals(p);

  cdplog.push("--- IndexedDB check ---");
  const idb = await p.evaluate(async () => {
    try {
      const dbs = await indexedDB.databases();
      return dbs.map(d => d.name);
    } catch (e) { return []; }
  });
  add("IDB", "IndexedDB数据库", idb.length > 0 ? "PASS" : "WARN", idb.length > 0 ? idb.join(",") : "无IndexedDB（数据存文件系统）");

  let idbData = null;
  if (idb.length > 0) {
    idbData = await p.evaluate(async () => {
      const result = {};
      try {
        const dbs = await indexedDB.databases();
        for (const dbInfo of dbs) {
          const db = await new Promise((res, rej) => {
            const req = indexedDB.open(dbInfo.name);
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
          });
          const storeNames = Array.from(db.objectStoreNames);
          result[dbInfo.name] = {};
          for (const storeName of storeNames) {
            const tx = db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);
            const records = await new Promise((res, rej) => {
              const req = store.getAll();
              req.onsuccess = () => res(req.result);
              req.onerror = () => rej(req.error);
            });
            result[dbInfo.name][storeName] = records.length > 0 ? records.slice(0, 5) : [];
          }
          db.close();
        }
      } catch (e) { result.error = e.message; }
      return result;
    });
    cdplog.push("IndexedDB data: " + JSON.stringify(idbData, null, 2));
  }

  cdplog.push("--- Chat panel check ---");
  const chatBtns = await p.evaluate(() => {
    const cp = document.querySelector("#chat-panel");
    if (!cp) return null;
    return Array.from(cp.querySelectorAll("button")).map(b => ({
      text: (b.textContent || "").trim().slice(0, 30),
      id: b.id || "",
      visible: b.offsetParent !== null
    }));
  });
  add("CHAT", "聊天面板按钮", chatBtns ? "PASS" : "FAIL", chatBtns ? chatBtns.length + " buttons" : "无聊天面板");
  if (chatBtns) {
    const texts = chatBtns.map(b => b.text);
    add("CHAT:copy", "聊天-复制", texts.some(x => x.includes("复制")) ? "PASS" : "FAIL", "");
    add("CHAT:regen", "聊天-重生成", texts.some(x => x.includes("重生成")) ? "PASS" : "FAIL", "");
    add("CHAT:insert", "聊天-插入", texts.some(x => x.includes("插入")) ? "PASS" : "FAIL", "");
    add("CHAT:replace", "聊天-替换", texts.some(x => x.includes("替换")) ? "PASS" : "FAIL", "");
  }

  cdplog.push("--- Chapter tree check ---");
  const treeBtns = await p.evaluate(() => {
    const ct = document.querySelector("#chapter-tree");
    if (!ct) return null;
    return Array.from(ct.querySelectorAll("button")).map(b => ({
      id: b.id || "",
      text: (b.textContent || "").trim().slice(0, 30),
      visible: b.offsetParent !== null
    }));
  });
  add("CTREE", "章节树按钮", treeBtns ? "PASS" : "FAIL", treeBtns ? treeBtns.length + " buttons" : "不存在");
  if (treeBtns) {
    add("CTREE:gen", "章节树-生成", treeBtns.some(b => b.text.includes("生成")) ? "PASS" : "FAIL", "");
    add("CTREE:project", "章节树-项目", treeBtns.some(b => b.text.includes("项目")) ? "PASS" : "FAIL", "");
  }

  cdplog.push("--- IPC methods check ---");
  const ipcMethods = await p.evaluate(() => {
    if (!window.electronAPI) return [];
    return Object.keys(window.electronAPI).filter(k => typeof window.electronAPI[k] === "function");
  });
  add("IPC", "IPC接口方法数", ipcMethods.length >= 30 ? "PASS" : "FAIL", ipcMethods.length + " methods");

  const pass = r.filter(x => x.status === "PASS").length;
  const fail = r.filter(x => x.status === "FAIL").length;
  const warn = r.filter(x => x.status === "WARN").length;
  add("SUMMARY", "验证总览", pass + "/" + r.length + "通过", pass + " PASS, " + fail + " FAIL, " + warn + " WARN, 共" + r.length + "项");
  cdplog.push("=== SUMMARY: PASS=" + pass + " FAIL=" + fail + " WARN=" + warn + " TOTAL=" + r.length + " ===");

  const lines = [
    "# 神意助手回归验证报告",
    "",
    "生成时间: " + new Date().toISOString(),
    "",
    "## 汇总",
    "|状态|数量|",
    "|---|---|",
    "|PASS|" + pass + "|",
    "|FAIL|" + fail + "|",
    "|WARN|" + warn + "|",
    "|Total|" + r.length + "|",
    "",
    "## 详细结果",
    "|ID|名称|状态|详情|",
    "|---|---|---|---|"
  ];
  for (const x of r) lines.push("|" + x.id + "|" + x.name + "|" + x.status + "|" + x.detail + "|");
  lines.push("", "## CDP操作日志", "```");
  for (const l of cdplog) lines.push(l);
  lines.push("```", "", "## IndexedDB数据", "```");
  lines.push(JSON.stringify(idbData || idb, null, 2));
  lines.push("```", "");
  fs.writeFileSync("_audit/REGRESSION_TODAY.md", lines.join("\n"), "utf8");
  console.log("Report: _audit/REGRESSION_TODAY.md");
  console.log("PASS: " + pass + ", FAIL: " + fail + ", WARN: " + warn + ", Total: " + r.length);
  await b.close();
}

main().catch(e => { console.error("FAIL: " + e.message); process.exit(1); });
