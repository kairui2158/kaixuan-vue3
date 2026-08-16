const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const CDP = "http://127.0.0.1:9227";
const REPORT_PATH = path.join(__dirname, "..", "REGRESSION_QUICK.md");
const results = [];
let passed = 0, failed = 0;

function log(step, ok, detail) {
  results.push({ step, ok, detail });
  console.log("[" + (ok ? "PASS" : "FAIL") + "] " + step + ": " + detail);
  if (ok) passed += 1; else failed += 1;
}

async function main() {
  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().startsWith("file:"));
  if (!page) throw new Error("file page not found");
  await page.waitForSelector("#app", { timeout: 15000 });
  await page.waitForTimeout(2000);

  // Phase A: Settings modal + skill tab
  await page.evaluate(() => {
    const btn = document.querySelector("#btn-settings");
    if (btn) btn.click();
  });
  await page.waitForTimeout(1500);
  const settingsOpen = await page.evaluate(() => {
    return !!document.querySelector("#settings-modal, #tab-api");
  });
  log("A1 设置弹窗打开", settingsOpen, JSON.stringify(settingsOpen));

  await page.evaluate(() => {
    const tab = document.querySelector("#tab-skill");
    if (tab) tab.click();
  });
  await page.waitForTimeout(800);
  const skillTab = await page.evaluate(() => {
    const tab = document.querySelector("#tab-skill");
    return tab && tab.classList.contains("active");
  });
  log("A2 技能标签页激活", skillTab, JSON.stringify(skillTab));

  const skillList = await page.evaluate(() => {
    const btns = document.querySelectorAll("button");
    const editBtns = [];
    btns.forEach((b) => {
      if (b.textContent.trim() === "编辑") editBtns.push(b.textContent);
    });
    return editBtns.length;
  });
  log("A3 技能列表编辑按钮存在", skillList > 0, "count=" + skillList);

  // Phase B: Pipeline modal + 5 layers
  await page.evaluate(() => {
    const closeBtn = document.querySelector("#btn-close-settings");
    if (closeBtn) closeBtn.click();
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const btn = document.querySelector("#btn-pipeline");
    if (btn) btn.click();
  });
  await page.waitForTimeout(1500);

  const pipelineOpen = await page.evaluate(() => {
    return !!document.querySelector("#pipeline-panel, #pl-s1-mode");
  });
  log("B1 流水线面板打开", pipelineOpen, JSON.stringify(pipelineOpen));

  const modeSelectors = await page.evaluate(() => {
    const sel = [];
    for (let i = 1; i <= 5; i++) {
      const el = document.querySelector("#pl-s" + i + "-mode");
      if (el) {
        const opts = Array.from(el.options).map((o) => o.value);
        sel.push({ step: i, options: opts });
      }
    }
    return sel;
  });
  log("B2 五层模式下拉存在", modeSelectors.length === 5, JSON.stringify(modeSelectors));

  // Phase C: Engine + custom vars
  const engine = await page.evaluate(() => {
    const e = window.SkillExecutionEngine;
    return e ? Object.keys(e) : null;
  });
  log("C1 引擎存在", !!engine, "methods=" + (engine ? engine.join(",") : "null"));

  const template = await page.evaluate(() => {
    const e = window.SkillExecutionEngine;
    return e ? e.resolveTemplate("测试{{var}}", { var: "通过" }, { keepMissing: false }) : null;
  });
  log("C2 模板解析", template === "测试通过", "result=" + template);

  // Close pipeline
  await page.evaluate(() => {
    const btn = document.querySelector("#btn-close-pipeline, .pipeline-close, .modal-close");
    if (btn) btn.click();
  });
  await page.waitForTimeout(500);

  await browser.close();

  // Report
  const lines = [];
  lines.push("# 全回归快速检查");
  lines.push("");
  lines.push(failed > 0 ? "**失败 " + failed + " 项**" : "**全部 " + passed + " 项通过**");
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
  fs.writeFileSync(REPORT_PATH, lines.join("\n"), "utf-8");
  console.log("\n[REPORT] " + REPORT_PATH);
  process.exit(failed > 0 ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
