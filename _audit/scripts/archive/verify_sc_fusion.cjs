const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const CDP = "http://127.0.0.1:9227";
const SHOT_DIR = path.join(__dirname, "..", "screenshots");
const results = [];
let passed = 0, failed = 0;

function log(step, ok, detail) {
  results.push({ step, ok, detail });
  console.log("[" + (ok ? "PASS" : "FAIL") + "] " + step + ": " + detail);
  if (ok) passed += 1; else failed += 1;
}

async function shot(page, name) {
  try {
    if (!fs.existsSync(SHOT_DIR)) fs.mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOT_DIR, name), fullPage: false });
    console.log("  screenshot saved:", name);
  } catch (e) {
    console.log("  screenshot failed:", e.message);
  }
}

async function main() {
  const browser = await chromium.connectOverCDP(CDP);
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().startsWith("file:"));
  if (!page) throw new Error("file page not found");

  await page.waitForSelector("#app", { timeout: 15000 });
  await page.waitForTimeout(1500);

  // 1. Verify settings-collection button is GONE from sidebar
  const scBtnGone = await page.evaluate(() => {
    return !document.querySelector("[data-tooltip='设定合集'], #btn-settings-collection, #settings-collection-panel");
  });
  log("P5-1 侧边栏设定合集按钮已删除", scBtnGone, "scBtnGone=" + JSON.stringify(scBtnGone));
  await shot(page, "sc_fusion_01_sidebar.png");

  // 2. Open pipeline panel
  const plAlready = await page.evaluate(() => !!document.querySelector("#pipeline-panel, #pl-s2-mode"));
  if (!plAlready) {
    await page.evaluate(() => {
      const btn = document.querySelector("#btn-pipeline");
      if (btn) btn.click();
    });
    await page.waitForTimeout(1500);
  } else {
    await page.waitForTimeout(300);
  }
  const plOpen = await page.evaluate(() => !!document.querySelector("#pipeline-panel"));
  log("P6-1 流水线面板打开", plOpen, JSON.stringify(plOpen));
  await shot(page, "sc_fusion_02_pipeline.png");

  // 3. Navigate to step 2 (settings)
  await page.evaluate(() => {
    const steps = document.querySelectorAll(".pl-step");
    if (steps.length > 1) steps[1].click();
  });
  await page.waitForTimeout(800);
  const step2Visible = await page.evaluate(() => {
    const panel = document.querySelector("#pl-step-2-content");
    return !!panel && getComputedStyle(panel).display !== "none";
  });
  log("P6-2 Step2 设定层可见", step2Visible, JSON.stringify(step2Visible));
  await shot(page, "sc_fusion_03_step2.png");

  // 4. Verify category sidebar exists
  const catSidebar = await page.evaluate(() => {
    const el = document.querySelector("#pl-sc-categories");
    return !!el && getComputedStyle(el).display !== "none";
  });
  log("P6-3 分类侧栏存在", catSidebar, JSON.stringify(catSidebar));

  // 5. Verify add category button
  const addCatBtn = await page.evaluate(() => {
    const btn = document.querySelector("#btn-pl-add-cat");
    return !!btn;
  });
  log("P6-4 新增分类按钮存在", addCatBtn, JSON.stringify(addCatBtn));

  // 6. Click add category, type name, confirm
  await page.evaluate(() => {
    document.querySelector("#btn-pl-add-cat").click();
  });
  await page.waitForTimeout(300);
  const addCatInput = await page.evaluate(() => {
    const input = document.querySelector(".pl-sc-add-cat-row input");
    if (!input) return false;
    input.value = "测试分类";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  });
  log("P6-5 新增分类输入框出现并可输入", addCatInput, JSON.stringify(addCatInput));

  await page.evaluate(() => {
    const confirmBtn = document.querySelector(".pl-sc-add-cat-row .btn-primary");
    if (confirmBtn) confirmBtn.click();
  });
  await page.waitForTimeout(500);
  const catAdded = await page.evaluate(() => {
    const items = document.querySelectorAll(".pl-sc-cat-item");
    let found = false;
    items.forEach((el) => {
      if (el.textContent.includes("测试分类")) found = true;
    });
    return found;
  });
  log("P6-6 新增分类成功", catAdded, JSON.stringify(catAdded));
  await shot(page, "sc_fusion_04_cat_added.png");

  // 7. Select the category, verify items area empty state
  await page.evaluate(() => {
    const items = document.querySelectorAll(".pl-sc-cat-item");
    items.forEach((el) => {
      if (el.textContent.includes("测试分类")) el.click();
    });
  });
  await page.waitForTimeout(300);
  const emptyState = await page.evaluate(() => {
    return !!document.querySelector(".pl-sc-items-area .empty-hint");
  });
  log("P6-7 空状态提示可见", emptyState, JSON.stringify(emptyState));

  // 8. Open add setting modal and add an item
  const addBtns = page.locator("#pl-step-2-content .pl-actions button", { hasText: "新增设定" });
  await addBtns.first().click();
  await page.waitForTimeout(500);
  const addModal = page.locator(".pl-add-setting-modal");
  const addModalOpen = await addModal.count() > 0;
  log("P6-8 新增设定弹窗打开", addModalOpen, JSON.stringify(addModalOpen));

  await addModal.locator(".pl-input").fill("测试设定");
  await addModal.locator("textarea").fill("这是一个测试属性");
  await page.waitForTimeout(200);
  await shot(page, "sc_fusion_05_add_setting_modal.png");

  await addModal.locator(".btn-primary").click();
  await page.waitForTimeout(800);
  const itemAdded = await page.evaluate(() => {
    for (const el of document.querySelectorAll(".pl-setting-item")) {
      const nameInput = el.querySelector("input");
      if (nameInput && nameInput.value.includes("测试设定")) return true;
    }
    return false;
  });
  log("P6-9 新增设定条目成功", itemAdded, JSON.stringify(itemAdded));
  const itemPersisted = await page.evaluate(() => {
    try {
      const lastId = window.electronAPI.storageRead("wa_lastProjectId");
      if (!lastId) return false;
      const data = window.electronAPI.storageRead("wa_project_" + lastId);
      const sc = (data && data.settingsCollection) || { categories: [], items: {} };
      const arr = (sc.items && sc.items["测试分类"] || []).filter((it) => it.name === "测试设定" && it.content === "这是一个测试属性" && it.category === "测试分类");
      return arr.length > 0;
    } catch (e) { return false; }
  });
  log("P6-9b 新增设定持久化到本地存储", itemPersisted, JSON.stringify(itemPersisted));

  // 9. Verify bind toggle button
  const bindBtn = await page.evaluate(() => {
    for (const el of document.querySelectorAll(".pl-setting-item")) {
      const nameInput = el.querySelector("input");
      if (nameInput && nameInput.value.includes("测试设定")) {
        for (const btn of el.querySelectorAll("button")) {
          if (btn.textContent.trim() === "绑定") return true;
        }
      }
    }
    return false;
  });
  log("P6-10 绑定按钮存在", bindBtn, JSON.stringify(bindBtn));
  await shot(page, "sc_fusion_06_item_added.png");

  // 10. Click bind toggle
  await page.evaluate(() => {
    for (const el of document.querySelectorAll(".pl-setting-item")) {
      const nameInput = el.querySelector("input");
      if (nameInput && nameInput.value.includes("测试设定")) {
        const btns = el.querySelectorAll("button");
        for (const b of btns) {
          if (b.textContent.trim() === "绑定") {
            b.click();
            return;
          }
        }
      }
    }
  });
  await page.waitForTimeout(500);
  const bindActive = await page.evaluate(() => {
    for (const el of document.querySelectorAll(".pl-setting-item")) {
      const nameInput = el.querySelector("input");
      if (nameInput && nameInput.value.includes("测试设定")) {
        const btns = el.querySelectorAll("button");
        for (const b of btns) {
          if (b.textContent.trim() === "已绑定") return true;
        }
      }
    }
    return false;
  });
  log("P6-11 绑定切换成功", bindActive, JSON.stringify(bindActive));
  await shot(page, "sc_fusion_07_bound.png");
  const bindPersisted = await page.evaluate(() => {
    try {
      const lastId = window.electronAPI.storageRead("wa_lastProjectId");
      if (!lastId) return false;
      const data = window.electronAPI.storageRead("wa_project_" + lastId);
      const sc = (data && data.settingsCollection) || { categories: [], items: {} };
      const arr = (sc.items && sc.items["测试分类"] || []).filter((it) => it.name === "测试设定" && it.isBound === true && (it.boundTo || []).includes("pipeline"));
      return arr.length > 0;
    } catch (e) { return false; }
  });
  log("P6-11b 绑定状态持久化到本地存储", bindPersisted, JSON.stringify(bindPersisted));

  // 11. Verify delete category works
  await page.evaluate(() => {
    const delBtns = document.querySelectorAll(".pl-sc-cat-del");
    // Find del button for 测试分类 (the last item, hover only)
    const items = document.querySelectorAll(".pl-sc-cat-item");
    items.forEach((el) => {
      if (el.textContent.includes("测试分类")) {
        const del = el.querySelector(".pl-sc-cat-del");
        if (del) del.click();
      }
    });
  });
  await page.waitForTimeout(300);
  const catDeleted = await page.evaluate(() => {
    const items = document.querySelectorAll(".pl-sc-cat-item");
    let found = false;
    items.forEach((el) => {
      if (el.textContent.includes("测试分类")) found = true;
    });
    return !found;
  });
  log("P6-12 删除分类成功", catDeleted, JSON.stringify(catDeleted));
  await shot(page, "sc_fusion_08_cat_deleted.png");

  // 12. Verify confirm button, save button exist
  const buttonsOk = await page.evaluate(() => {
    const confirmBtn = document.querySelector("#btn-pl-confirm-settings");
    const saveBtn = document.querySelector("#btn-pl-save-settings");
    const genBtn = document.querySelector("#btn-pl-gen-settings");
    return !!confirmBtn && !!saveBtn && !!genBtn;
  });
  log("P6-13 确认/保存/AI生成按钮均存在", buttonsOk, JSON.stringify(buttonsOk));

  // 13. Clean test data so user projects are not polluted
  const cleaned = await page.evaluate(() => {
    try {
      const lastId = window.electronAPI.storageRead("wa_lastProjectId");
      if (!lastId) return false;
      const data = window.electronAPI.storageRead("wa_project_" + lastId);
      if (!data) return false;
      const sc = data.settingsCollection || { categories: [], items: {} };
      const testNames = ["测试设定", "调试设定", "测试世界观", "新条目"];
      const cats = Array.isArray(sc.categories) ? sc.categories : [];
      const testCatIdx = cats.indexOf("测试分类");
      if (testCatIdx >= 0) {
        cats.splice(testCatIdx, 1);
        delete sc.items["测试分类"];
      }
      for (const cat of Object.keys(sc.items || {})) {
        sc.items[cat] = (sc.items[cat] || []).filter((it) => !testNames.includes(it.name));
      }
      sc.categories = cats.filter((c) => (sc.items[c] || []).length > 0);
      data.settingsCollection = sc;
      const ok = window.electronAPI.storageWrite("wa_project_" + lastId, data);
      const afterData = window.electronAPI.storageRead("wa_project_" + lastId);
      const afterSc = afterData && afterData.settingsCollection;
      const remaining = Object.values(afterSc && afterSc.items || {}).reduce((n, arr) => n + arr.length, 0);
      return ok === true && remaining === 0;
    } catch (e) { return false; }
  });
  log("P6-14 测试数据已清理", cleaned, JSON.stringify(cleaned));
  await shot(page, "sc_fusion_09_cleaned.png");

  console.log("\n=== SUMMARY: " + passed + " passed, " + failed + " failed ===\n");
  await browser.close();
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
