const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.connectOverCDP("http://localhost:9227");
  const pages = browser.contexts()[0].pages();
  const page = pages[0];
  
  const results = [];
  function add(id, title, expected, actual, pass, extra) {
    results.push({ id, title, expected, actual: String(actual), pass, extra: extra || null });
  }

  console.log("=== 神意助手深度回归检查 ===\n");

  const title = await page.title();
  add("G01", "页面标题", "神意助手", title, title === "神意助手");
  console.log("[G01] 标题:", title, title === "神意助手" ? "OK" : "FAIL");

  const dom = await page.evaluate(() => ({
    app: !!document.querySelector("#app"),
    sidebar: !!document.querySelector(".sidebar"),
    tree: !!document.querySelector(".chapter-tree"),
    editor: !!document.querySelector(".editor-panel") || !!document.querySelector("#editor"),
    chat: !!document.querySelector(".chat-panel") || !!document.querySelector("#chat-panel")
  }));
  add("G02", "App根节点", "存在", dom.app, dom.app);
  add("G03", "侧边栏", "存在", dom.sidebar, dom.sidebar);
  add("G04", "章节树", "存在", dom.tree, dom.tree);
  add("G05", "编辑器", "存在", dom.editor, dom.editor);
  add("G06", "聊天面板", "存在", dom.chat, dom.chat);
  console.log("[G02-G06] DOM:", JSON.stringify(dom));

  const stores = await page.evaluate(() => {
    try {
      const app = document.querySelector("#app").__vue_app__;
      const pinia = app.config.globalProperties.$pinia;
      if (!pinia) return { count: 0, stores: [] };
      return { count: Object.keys(pinia._s).length, stores: Object.keys(pinia._s) };
    } catch(e) { return { count: 0, stores: [], error: e.message }; }
  });
  add("G07", "Pinia stores", ">=10", stores.count, stores.count >= 10, stores.stores);
  console.log("[G07] Stores:", stores.count, stores.count >= 10 ? "OK" : "FAIL");

  const apiKeys = await page.evaluate(() => Object.keys(window.electronAPI || {}));
  add("G08", "electronAPI", ">=20", apiKeys.length, apiKeys.length >= 20, apiKeys);
  console.log("[G08] API:", apiKeys.length, apiKeys.length >= 20 ? "OK" : "FAIL");

  const outlineBtn = await page.$('[data-panel="outline-workspace"], #btn-outline-workspace, .sidebar-btn-outline');
  if (outlineBtn) { await outlineBtn.click(); await page.waitForTimeout(500); }
  const ow = await page.evaluate(() => {
    const el = document.querySelector(".ow-overlay, [class*=\"outline-workspace\"]");
    if (!el) return { found: false, btnCount: 0, buttons: [] };
    const btns = Array.from(el.querySelectorAll("button, .btn, [role=\"button\"]")).map(b => ({
      text: (b.textContent || "").trim().substring(0, 30),
      id: b.id || "",
      visible: b.offsetParent !== null
    }));
    return { found: true, btnCount: btns.length, buttons: btns };
  });
  add("G09", "大纲工作台打开", "可见", ow.found, ow.found, ow);
  add("G10", "大纲工作台按钮数", ">=8", ow.btnCount || 0, (ow.btnCount || 0) >= 8, ow.buttons);
  console.log("[G09-G10] 大纲:", ow.found ? "OK" : "FAIL", "按钮:", ow.btnCount || 0, (ow.btnCount || 0) >= 8 ? "OK" : "FAIL");

  if (ow.buttons && ow.buttons.length > 0) {
    const texts = ow.buttons.map(b => b.text);
    add("G11", "大纲-AI共创", "存在", texts.some(t => t.includes("AI")), texts.some(t => t.includes("AI")), texts);
    add("G12", "大纲-导入", "存在", texts.some(t => t.includes("导入")), texts.some(t => t.includes("导入")), null);
    add("G13", "大纲-保存", "存在", texts.some(t => t.includes("保存")), texts.some(t => t.includes("保存")), null);
    add("G14", "大纲-锁定", "存在", texts.some(t => t.includes("锁定") || t.includes("确认")), texts.some(t => t.includes("锁定") || t.includes("确认")), null);
  }

  if (ow.found) {
    const closeBtn = await page.$(".ow-overlay .btn-close, .ow-overlay [class*=\"close\"]");
    if (closeBtn) await closeBtn.click();
    await page.waitForTimeout(300);
  }
  const plBtn = await page.$('[data-panel="pipeline"], #btn-pipeline, .sidebar-btn-pipeline');
  if (plBtn) { await plBtn.click(); await page.waitForTimeout(500); }
  const pl = await page.evaluate(() => {
    const el = document.querySelector(".pl-overlay, [class*=\"pipeline-panel\"]");
    if (!el) return { found: false, btnCount: 0, buttons: [] };
    const btns = Array.from(el.querySelectorAll("button, .btn, [role=\"button\"]")).map(b => ({
      text: (b.textContent || "").trim().substring(0, 35),
      id: b.id || "",
      visible: b.offsetParent !== null
    }));
    return { found: true, btnCount: btns.length, buttons: btns };
  });
  add("G15", "生成流水线打开", "可见", pl.found, pl.found, pl);
  add("G16", "生成流水线按钮数", ">=30", pl.btnCount || 0, (pl.btnCount || 0) >= 30, pl.buttons);
  console.log("[G15-G16] 流水线:", pl.found ? "OK" : "FAIL", "按钮:", pl.btnCount || 0, (pl.btnCount || 0) >= 30 ? "OK" : "FAIL");

  if (pl.buttons && pl.buttons.length > 0) {
    const texts = pl.buttons.map(b => b.text);
    add("G17", "流水线-大纲层", "存在", texts.some(t => t.includes("大纲") || t.includes("outline")), null, null);
    add("G18", "流水线-设定层", "存在", texts.some(t => t.includes("设定") || t.includes("setting")), null, null);
    add("G19", "流水线-卷纲层", "存在", texts.some(t => t.includes("卷") || t.includes("volume")), null, null);
    add("G20", "流水线-章节层", "存在", texts.some(t => t.includes("章节") || t.includes("chapter")), null, null);
    add("G21", "流水线-正文层", "存在", texts.some(t => t.includes("正文") || t.includes("body") || t.includes("生成")), null, null);
    add("G22", "流水线-新增设定", "存在", texts.some(t => t.includes("新增")), null, null);
    add("G23", "流水线-确认完成", "存在", texts.some(t => t.includes("确认") || t.includes("完成")), null, null);
  }

  if (pl.found) {
    const closePl = await page.$(".pl-overlay [class*=\"close\"], .pl-overlay .btn-close");
    if (closePl) await closePl.click();
    await page.waitForTimeout(300);
  }
  const scBtn = await page.$('[data-panel="settings-collection"], #btn-sc, .sidebar-btn-sc');
  if (scBtn) { await scBtn.click(); await page.waitForTimeout(500); }
  const sc = await page.evaluate(() => {
    const el = document.querySelector(".sc-overlay, [class*=\"settings-collection\"], #settings-collection-panel");
    if (!el) return { found: false, btnCount: 0, buttons: [] };
    const btns = Array.from(el.querySelectorAll("button, .btn, [role=\"button\"]")).map(b => ({
      text: (b.textContent || "").trim().substring(0, 30),
      visible: b.offsetParent !== null
    }));
    return { found: true, btnCount: btns.length, buttons: btns };
  });
  add("G24", "设定合集打开", "可见", sc.found, sc.found, sc);
  add("G25", "设定合集按钮数", ">=4", sc.btnCount || 0, (sc.btnCount || 0) >= 4, sc.buttons);
  console.log("[G24-G25] 设定合集:", sc.found ? "OK" : "FAIL", "按钮:", sc.btnCount || 0, (sc.btnCount || 0) >= 4 ? "OK" : "FAIL");

  if (sc.found) {
    const closeSc = await page.$(".sc-overlay [class*=\"close\"], #settings-collection-panel [class*=\"close\"]");
    if (closeSc) await closeSc.click();
    await page.waitForTimeout(300);
  }
  const projBtn = await page.$("#btn-open-project, .btn-project, [class*=\"project-btn\"]");
  if (projBtn) { await projBtn.click(); await page.waitForTimeout(500); }
  const proj = await page.evaluate(() => {
    const el = document.querySelector(".project-modal, .modal-overlay.project-modal, [class*=\"project-modal\"]");
    if (!el) return { found: false, btnCount: 0, buttons: [] };
    const btns = Array.from(el.querySelectorAll("button, .btn, [role=\"button\"]")).map(b => ({
      text: (b.textContent || "").trim().substring(0, 30),
      visible: b.offsetParent !== null
    }));
    return { found: true, btnCount: btns.length, buttons: btns };
  });
  add("G26", "项目弹窗打开", "可见", proj.found, proj.found, proj);
  add("G27", "项目弹窗按钮数", ">=3", proj.btnCount || 0, (proj.btnCount || 0) >= 3, proj.buttons);
  console.log("[G26-G27] 项目弹窗:", proj.found ? "OK" : "FAIL", "按钮:", proj.btnCount || 0, (proj.btnCount || 0) >= 3 ? "OK" : "FAIL");

  console.log("\n=== 检查完成 ===");
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log("通过:", passed, "/", results.length, "失败:", failed);
  console.log(JSON.stringify({ timestamp: new Date().toISOString(), total: results.length, passed, failed, items: results }, null, 2));

  await browser.close();
})().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
