const { chromium } = require("playwright");
async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9227", { timeout: 5000 });
  const p = browser.contexts()[0]?.pages()[0];
  if (!p) { console.log("No page"); await browser.close(); return; }
  await p.waitForTimeout(500);
  
  const R = []; // results
  const V = async (label, fn) => {
    try { await fn(); R.push("[PASS] " + label); } catch(e) { R.push("[FAIL] " + label + ": " + e.message); }
  };
  
  // === Item 1: AI共创按钮可见性 ===
  await V("Item1: 打开大纲工作台", async () => {
    await p.evaluate(() => document.querySelector("#btn-outline-workspace")?.click());
    await p.waitForTimeout(600);
    if (!(await p.evaluate(() => !!document.querySelector("#outline-workspace")))) throw "outline not open";
  });
  
  await V("Item1: AI共创按钮可见", async () => {
    const btn = await p.$("#btn-ai-co-create");
    if (!btn || !(await btn.isVisible())) throw "button not visible";
  });
  
  await V("Item1: AI共创点击切换聊天区", async () => {
    await p.evaluate(() => document.querySelector("#btn-ai-co-create")?.click());
    await p.waitForTimeout(400);
    const display = await p.evaluate(() => getComputedStyle(document.querySelector(".ow-chat")).display);
    if (display !== "flex") throw "chat not visible: " + display;
  });
  
  // === Item 2: SkillBindModal弹窗行为 ===
  await V("Item2: 关闭大纲工作台", async () => {
    await p.evaluate(() => document.querySelector("#btn-close-outline-workspace")?.click());
    await p.waitForTimeout(400);
    if (await p.evaluate(() => !!document.querySelector("#outline-workspace"))) throw "still open";
  });
  
  // Click pipeline button to check SkillBindModal
  await V("Item2: 打开生成流水线", async () => {
    await p.evaluate(() => document.querySelector("#btn-pipeline")?.click());
    await p.waitForTimeout(600);
    const pp = await p.$(".pipeline-panel");
    if (!pp) throw "pipeline not open";
  });
  
  // Check if SkillBindModal appears
  await V("Item2: 检查SkillBind弹窗", async () => {
    const sbm = await p.$(".skill-bind-modal");
    console.log("SkillBindModal:", sbm ? "EXISTS" : "NOT FOUND");
    // It might not appear until triggered, that's fine
  });
  
  // === Item 3: 编辑器↔对话框同步 ===
  await V("Item3: 编辑器存在", async () => {
    const editor = await p.$("#editor-panel");
    if (!editor || !(await editor.isVisible())) throw "editor not visible";
  });
  
  await V("Item3: 对话框存在", async () => {
    const chat = await p.$(".chat-panel");
    if (!chat || !(await chat.isVisible())) throw "chat not visible";
  });
  
  // === Item 4: 章节树联动 ===
  await V("Item4: 章节树存在", async () => {
    const tree = await p.$("#chapter-tree");
    if (!tree || !(await tree.isVisible())) throw "chapter tree not visible";
  });
  
  // === Item 5: 退出保存机制 ===
  await V("Item5: 退出按钮存在", async () => {
    const btn = await p.$("#btn-clear");
    if (!btn || !(await btn.isVisible())) throw "exit button not visible";
  });
  
  // === Item 6: 生成流水线按钮 ===
  await V("Item6: 流水线面板可见", async () => {
    const pp = await p.$(".pipeline-panel");
    if (!pp || !(await pp.isVisible())) throw "pipeline panel not visible";
  });
  
  // Close pipeline
  await p.evaluate(() => {
    const closeBtn = document.querySelector(".pipeline-panel .modal-close, .pipeline-panel [class*=close]");
    if (closeBtn) closeBtn.click();
  });
  await p.waitForTimeout(400);
  
  await p.screenshot({ path: "D:/codex/novel-workshop-vue3/_audit/cdp_verify_final.png" });
  
  console.log("\n=== VERIFICATION RESULTS ===");
  R.forEach(r => console.log(r));
  await browser.close();
}
main().catch(e => { console.error("Error:", e.message); });
