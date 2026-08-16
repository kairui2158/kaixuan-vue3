const { chromium } = require("playwright");
async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9227", { timeout: 5000 });
  const p = browser.contexts()[0]?.pages()[0];
  if (!p) { console.log("No page"); await browser.close(); return; }
  await p.waitForTimeout(500);
  
  await p.evaluate(() => { document.querySelector("#btn-outline-workspace")?.click(); });
  await p.waitForTimeout(600);
  
  // Check chatAreaOpen before click
  const before = await p.evaluate(() => {
    const app = document.querySelector("#app");
    if (!app || !app.__vue_app__) return "no vue app";
    try {
      // Try to find the outline component state
      const vm = app.__vue_app__._instance;
      const outlineVm = vm?.subTree?.children?.find(c => c?.component?.props?.id === "outline-workspace");
      return "vue app found";
    } catch(e) { return "error: " + e.message; }
  });
  console.log("Vue before:", before);
  
  // Click AI共创
  await p.evaluate(() => { document.querySelector("#btn-ai-co-create")?.click(); });
  await p.waitForTimeout(500);
  
  // Check display after click
  const after = await p.evaluate(() => {
    const chat = document.querySelector(".ow-chat");
    if (!chat) return "no chat";
    return "chat display: " + getComputedStyle(chat).display;
  });
  console.log("After click:", after);
  
  // Also check if click handler has error
  const errors = await p.evaluate(() => {
    const btn = document.querySelector("#btn-ai-co-create");
    if (!btn) return "no btn";
    // Try manual dispatch
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return "dispatched";
  });
  console.log("Dispatch:", errors);
  await p.waitForTimeout(400);
  
  const after2 = await p.evaluate(() => {
    const chat = document.querySelector(".ow-chat");
    if (!chat) return "no chat";
    return "chat display: " + getComputedStyle(chat).display;
  });
  console.log("After dispatch:", after2);
  
  await browser.close();
}
main().catch(e => { console.error("Error:", e.message); });
