/* 神意全应用美化 G4 验证
 * 真实用户链路：打开设置→7个标签页→技能编辑弹窗→聊天真实发送→项目管理/插件市场/仪表盘/流水线新增设定/技能绑定/去AI进度
 * 只读验证：除聊天发送（可恢复）与去AI进度渲染（store动作+finally恢复）外不修改持久化状态
 */
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const CDP = "http://127.0.0.1:9227";
const SHOT_DIR = path.join(__dirname, "..", "screenshots");
const REPORT_PATH = path.join(__dirname, "..", "G4_UI_VERIFY_REPORT.md");
const results = [];
let passed = 0;
let failed = 0;

function log(step, ok, detail) {
  results.push({ step, ok, detail });
  console.log(`[${ok ? "PASS" : "FAIL"}] ${step}: ${detail}`);
  if (ok) passed += 1;
  else failed += 1;
}

async function shot(page, name) {
  try {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOT_DIR, name), fullPage: false });
    console.log("[SHOT] " + name);
  } catch (e) {
    console.log("[SHOT-FAIL] " + name + ": " + e.message);
  }
}

async function clickSel(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (el) { el.click(); return true; }
    return false;
  }, selector);
}

async function clickByText(page, text, scopeSel) {
  return page.evaluate(({ text, scopeSel }) => {
    const root = scopeSel ? document.querySelector(scopeSel) : document;
    if (!root) return false;
    const buttons = Array.from(root.querySelectorAll("button"));
    const btn = buttons.find((b) => b.textContent.trim() === text);
    if (btn) { btn.click(); return true; }
    return false;
  }, { text, scopeSel: scopeSel || null });
}

async function measure(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { exists: false };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      exists: true,
      width: Math.round(r.width),
      height: Math.round(r.height),
      fontSize: cs.fontSize,
      lineHeight: cs.lineHeight,
      paddingTop: cs.paddingTop,
      paddingLeft: cs.paddingLeft,
      paddingRight: cs.paddingRight,
      paddingBottom: cs.paddingBottom,
      maxWidth: cs.maxWidth,
    };
  }, selector);
}

async function main() {
  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().startsWith("file:"));
  if (!page) throw new Error("file page not found");
  await page.waitForSelector("#app", { timeout: 15000 });
  await page.waitForTimeout(2500);

  const url = page.url();
  log("D0 应用已启动并加载源构建产物", url.includes("dist-renderer"), url.slice(0, 120));

  const entryPoints = await page.evaluate(() => ({
    chat: !!document.querySelector("#chat-panel"),
    settings: !!document.querySelector("#btn-settings"),
    pipeline: !!document.querySelector("#btn-pipeline"),
    dashboard: !!document.querySelector("#btn-dashboard"),
    plugin: !!document.querySelector("#btn-plugin-market"),
    project: !!document.querySelector("#btn-open-project"),
    sidebar: !!document.querySelector("#app-sidebar"),
  }));
  const entryOk = Object.values(entryPoints).every(Boolean);
  log("D1 主界面入口齐全（聊天/设置/流水线/仪表盘/插件市场/项目）", entryOk, JSON.stringify(entryPoints));
  await shot(page, "g4_01_main.png");

  // ============ G2 聊天域 ============
  const chatInput = await measure(page, "#user-input");
  const chatSelect = await measure(page, "#model-select-chat");
  log("G2.1 聊天输入框字号14px/高度36px", chatInput.fontSize === "14px" && chatInput.height === 36,
    JSON.stringify({ fontSize: chatInput.fontSize, height: chatInput.height }));
  log("G2.2 聊天模型选择器字号12px/高度28px", chatSelect.fontSize === "12px" && chatSelect.height === 28,
    JSON.stringify({ fontSize: chatSelect.fontSize, height: chatSelect.height }));

  const beforeCount = await page.evaluate(() => document.querySelectorAll("#messages-container .chat-message").length);
  await page.evaluate(() => {
    const input = document.querySelector("#user-input");
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
    if (input) setter.call(input, "这是全应用美化G2字体验证消息（真实发送链路）");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await clickSel(page, "#btn-send");
  let userRendered = false;
  try {
    await page.waitForFunction((n) => document.querySelectorAll("#messages-container .chat-message").length > n, beforeCount, { timeout: 15000 });
    userRendered = true;
  } catch (e) { /* keep result below */ }
  await page.waitForTimeout(1200);
  log("G2.3 真实发送后新消息渲染在聊天区", userRendered, "before=" + beforeCount);

  // 等待助手回复（真实API链路），最长60秒；失败仍记录现状
  let assistantRendered = false;
  try {
    await page.waitForFunction((n) => document.querySelectorAll("#messages-container .chat-message.assistant").length > n,
      await page.evaluate(() => document.querySelectorAll("#messages-container .chat-message.assistant").length),
      { timeout: 60000 });
    assistantRendered = true;
  } catch (e) { /* timeout tolerated, 记录 */ }
  await page.waitForTimeout(1500);

  const bubble = await measure(page, "#messages-container .chat-message:last-child .message-bubble");
  const msgBtn = await measure(page, "#messages-container .message-actions .msg-btn");
  const lineOk = bubble.lineHeight === "1.7" ||
    Math.abs((parseFloat(bubble.lineHeight) || 0) / (parseFloat(bubble.fontSize) || 1) - 1.7) < 0.02;
  log("G2.4 最新消息气泡 14px/行高1.7", bubble.fontSize === "14px" && lineOk,
    JSON.stringify({ fontSize: bubble.fontSize, lineHeight: bubble.lineHeight }));
  log("G2.5 消息操作按钮 12px/内边距4px 10px", msgBtn.fontSize === "12px" && msgBtn.paddingTop === "4px" && msgBtn.paddingLeft === "10px",
    JSON.stringify({ fontSize: msgBtn.fontSize, paddingTop: msgBtn.paddingTop, paddingLeft: msgBtn.paddingLeft }));
  log("G2.6 真实API助手回复链路完成（无超时）", assistantRendered, "assistantRendered=" + assistantRendered);
  await shot(page, "g4_02_chat_bubbles.png");

  // ============ G1 设置域 ============
  await clickSel(page, "#btn-settings");
  await page.waitForTimeout(800);
  const settingsModal = await measure(page, ".modal-content.modal-lg");
  log("G3.1 设置弹窗宽度≥900px", settingsModal.width >= 900,
    JSON.stringify({ width: settingsModal.width, height: settingsModal.height }));

  const tabChecks = [
    { id: "api", sel: "#cfg-provider-name", label: "API输入框14px/高34px" },
    { id: "skill", sel: ".skill-card-name", label: "技能卡片名15px" },
    { id: "agent", sel: "#af-name", label: "智能体输入框14px/高34px" },
    { id: "appearance", sel: ".settings-row input[type=number]", label: "外观输入框14px/高34px" },
    { id: "deai", sel: ".deai-mode-card-desc", label: "去AI味描述13px" },
    { id: "diag", sel: ".settings-panel", label: "诊断日志面板可见" },
    { id: "mcp", sel: ".mcp-form-row input", label: "MCP输入框14px" },
  ];
  for (const t of tabChecks) {
    await clickSel(page, "#tab-" + t.id);
    await page.waitForTimeout(500);
    const active = await page.evaluate((id) => {
      const tab = document.querySelector("#tab-" + id);
      return !!(tab && tab.classList.contains("active"));
    }, t.id);
    let opened = "readonly";
    if (t.id === "api") {
      opened = await page.evaluate(() => {
        const card = document.querySelector(".provider-card");
        if (card) {
          const btn = Array.from(card.querySelectorAll("button")).find((b) => b.textContent.trim() === "编辑");
          if (btn) { btn.click(); return "edit-card"; }
        }
        const add = document.querySelector(".provider-card-add");
        if (add) { add.click(); return "add-card"; }
        return "none";
      });
      await page.waitForTimeout(500);
    } else if (t.id === "agent") {
      opened = await page.evaluate(() => {
        const card = document.querySelector(".agent-card");
        if (card) {
          const btn = Array.from(card.querySelectorAll("button")).find((b) => b.textContent.trim() === "编辑");
          if (btn) { btn.click(); return "edit-card"; }
        }
        const add = document.querySelector("#btn-add-agent");
        if (add) { add.click(); return "add-agent"; }
        return "none";
      });
      await page.waitForTimeout(500);
    } else if (t.id === "mcp") {
      opened = (await clickByText(page, "添加服务器")) ? "add-form" : "open-failed";
      await page.waitForTimeout(400);
    }
    const m = await measure(page, t.sel);
    let ok = active && m.exists;
    let detail = "active=" + active + " opened=" + opened + " " + JSON.stringify({ fontSize: m.fontSize, height: m.height });
    if (t.id === "api") ok = ok && m.fontSize === "14px" && m.height === 34;
    if (t.id === "skill") ok = ok && m.fontSize === "15px";
    if (t.id === "agent") ok = ok && m.fontSize === "14px" && m.height === 34;
    if (t.id === "appearance") ok = ok && m.fontSize === "14px" && m.height === 34;
    if (t.id === "deai") ok = ok && m.fontSize === "13px";
    if (t.id === "mcp") ok = ok && m.fontSize === "14px";
    log("G1." + (tabChecks.indexOf(t) + 1) + " 设置标签页[" + t.id + "] " + t.label, ok, detail);
    await shot(page, "g4_03_settings_" + t.id + ".png");
  }

  // 技能编辑弹窗（600→720px）
  await clickSel(page, "#tab-skill");
  await page.waitForTimeout(500);
  const openedEdit = await clickByText(page, "编辑");
  await page.waitForTimeout(700);
  const skillEdit = await measure(page, "#skill-form.skill-edit-modal");
  const semInput = await measure(page, "#skill-form .sem-input");
  const semTextarea = await measure(page, "#sf-template");
  const editOk = openedEdit && skillEdit.exists && skillEdit.width >= 700;
  log("G3.2 技能编辑弹窗宽度≥700px", editOk,
    JSON.stringify({ openedEdit, width: skillEdit.width, height: skillEdit.height }));
  log("G1.8 技能编辑输入框14px/文本域13px",
    semInput.fontSize === "14px" && semTextarea.fontSize === "13px",
    JSON.stringify({ input: semInput.fontSize, textarea: semTextarea.fontSize }));
  await shot(page, "g4_04_skill_edit_modal.png");
  await clickSel(page, "#skill-form .sem-header button");
  await page.waitForTimeout(400);

  await clickSel(page, "#btn-close-settings");
  await page.waitForTimeout(700);

  // ============ G3 弹窗域 ============
  // 项目管理弹窗
  await clickSel(page, "#btn-open-project");
  await page.waitForTimeout(800);
  const projectModal = await measure(page, ".modal-content.project-modal-content");
  log("G3.3 项目管理弹窗宽度≥540px", projectModal.exists && projectModal.width >= 540,
    JSON.stringify({ width: projectModal.width, height: projectModal.height }));
  await shot(page, "g4_05_project_modal.png");
  await clickSel(page, ".project-modal-content .btn-close");
  await page.waitForTimeout(500);

  // 插件市场
  await clickSel(page, "#btn-plugin-market");
  await page.waitForTimeout(800);
  const pluginMarket = await measure(page, ".pm-content");
  log("G3.4 插件市场弹窗宽度≥780px", pluginMarket.exists && pluginMarket.width >= 780,
    JSON.stringify({ width: pluginMarket.width, height: pluginMarket.height }));
  await shot(page, "g4_06_plugin_market.png");
  await clickSel(page, "#btn-close-market");
  await page.waitForTimeout(500);

  // 写作仪表盘
  await clickSel(page, "#btn-dashboard");
  await page.waitForTimeout(800);
  const dashModal = await measure(page, ".dash-modal");
  log("G3.5 写作仪表盘弹窗宽度≥660px", dashModal.exists && dashModal.width >= 660,
    JSON.stringify({ width: dashModal.width, height: dashModal.height }));
  await shot(page, "g4_07_dashboard.png");
  await clickSel(page, ".dash-modal .btn-close");
  await page.waitForTimeout(500);

  // 流水线 + 新增设定弹窗
  await clickSel(page, "#btn-pipeline");
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const steps = document.querySelectorAll("#pl-steps .pl-step");
    if (steps.length > 1) steps[1].click();
  });
  await page.waitForTimeout(600);
  const addOk = await clickByText(page, "+ 新增设定");
  await page.waitForTimeout(700);
  const addSetting = await measure(page, ".pl-add-setting-modal");
  log("G3.6 流水线新增设定弹窗宽度≥620px", addOk && addSetting.exists && addSetting.width >= 620,
    JSON.stringify({ addOk, width: addSetting.width, height: addSetting.height }));
  await shot(page, "g4_08_pipeline_add_setting.png");
  await clickSel(page, ".pl-add-setting-header button");
  await page.waitForTimeout(400);
  await clickSel(page, "#btn-close-pl");
  await page.waitForTimeout(600);

  // 技能绑定弹窗（章节树右键真实链路）
  const bindOpened = await page.evaluate(() => {
    const item = document.querySelector("#chapter-tree .volume-item, #chapter-tree .chapter-item");
    if (!item) return false;
    const r = item.getBoundingClientRect();
    item.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 10 }));
    return true;
  });
  await page.waitForTimeout(500);
  const menuOk = await clickByText(page, "绑定技能");
  await page.waitForTimeout(700);
  const bindModal = await measure(page, ".skill-bind-content");
  log("G3.7 技能绑定弹窗宽度≥500px（右键章节树真实链路）",
    bindOpened && menuOk && bindModal.exists && bindModal.width >= 500,
    JSON.stringify({ bindOpened, menuOk, width: bindModal.width, height: bindModal.height }));
  await shot(page, "g4_09_skill_bind.png");
  await clickSel(page, "#skill-bind-modal .sbm-close");
  await page.waitForTimeout(500);

  // 去AI进度弹窗：仅渲染验证，不触发真实处理（避免改动正文数据）
  let deaiOk = false;
  let deaiMeasure = {};
  try {
    await page.evaluate(() => {
      const store = window.__pinia && window.__pinia._s ? window.__pinia._s.get("deai") : null;
      if (store) store.startProcessing();
    });
    await page.waitForSelector(".deai-progress-modal", { timeout: 5000 });
    deaiMeasure = await measure(page, ".deai-progress-modal");
    deaiOk = deaiMeasure.width >= 520;
    await shot(page, "g4_10_deai_progress.png");
  } catch (e) {
    console.log("[WARN] deai-progress render: " + e.message);
  } finally {
    await page.evaluate(() => {
      const store = window.__pinia && window.__pinia._s ? window.__pinia._s.get("deai") : null;
      if (store) store.finishProcessing();
    }).catch(() => {});
    await page.waitForTimeout(400);
  }
  log("G3.8 去AI进度弹窗渲染且宽度≥520px（store渲染+finally恢复）",
    deaiOk, JSON.stringify(deaiMeasure));

  // 清理：确保所有面板关闭
  await clickSel(page, "#btn-close-settings");
  await clickSel(page, "#btn-close-pl");
  await clickSel(page, "#btn-close-market");
  const cleanup = await page.evaluate(() => ({
    settings: !!document.querySelector("#settings-modal"),
    pipeline: !!document.querySelector("#pipeline-panel"),
    bind: !!document.querySelector("#skill-bind-modal"),
  }));
  log("G9 验证结束后所有弹窗已关闭（无残留）", !cleanup.settings && !cleanup.pipeline && !cleanup.bind,
    JSON.stringify(cleanup));
  await shot(page, "g4_11_final_clean.png");

  await browser.close();

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  const lines = [];
  lines.push("# 神意全应用美化 G4 真机验证报告");
  lines.push("");
  lines.push("> 验证方式：源构建产物 + start-electron.bat 启动 + CDP 真实用户操作链路");
  lines.push("> 页面：`" + url.split("?")[0] + "`");
  lines.push("");
  lines.push(failed > 0 ? "**失败 " + failed + " 项，通过 " + passed + " 项**" : "**全部 " + passed + " 项通过**");
  lines.push("");
  lines.push("| 通过 | 失败 |");
  lines.push("|------|------|");
  lines.push("| " + passed + " | " + failed + " |");
  lines.push("");
  lines.push("## 逐项结果");
  lines.push("");
  lines.push("| 步骤 | 结果 | 详情 |");
  lines.push("|------|------|------|");
  for (const r of results) {
    lines.push("| " + r.step + " | " + (r.ok ? "PASS" : "FAIL") + " | " + String(r.detail).replace(/\|/g, "\\|") + " |");
  }
  lines.push("");
  lines.push("## 截图");
  lines.push("");
  lines.push("路径：`_audit/screenshots/g4_*.png`（主界面、聊天气泡、7个设置页、技能编辑、项目、插件市场、仪表盘、流水线新增设定、技能绑定、去AI进度）");
  lines.push("");
  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  console.log("\n[REPORT] " + REPORT_PATH);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
