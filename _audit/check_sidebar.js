const { chromium } = require("playwright");
async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9227", { timeout: 5000 });
  const p = browser.contexts()[0]?.pages()[0];
  if (!p) { console.log("No page"); await browser.close(); return; }
  await p.waitForTimeout(800);

  // Check the left sidebar area
  const sidebar = await p.$(".app-sidebar, .sidebar, #sidebar, .left-sidebar");
  console.log("Sidebar element:", sidebar ? "FOUND" : "NOT FOUND");

  // Get all buttons in the sidebar area
  const result = await p.evaluate(() => {
    const sidebarEls = document.querySelectorAll(".app-sidebar, .sidebar, #sidebar, .left-sidebar, aside, nav");
    const items = [];
    for (const el of sidebarEls) {
      items.push({
        tag: el.tagName,
        id: el.id || "",
        class: (typeof el.className === "string") ? el.className : "",
        rect: {
          width: el.getBoundingClientRect().width,
          height: el.getBoundingClientRect().height
        },
        display: getComputedStyle(el).display
      });
    }
    return items;
  });
  console.log("Sidebar elements:", JSON.stringify(result, null, 2));

  // List all buttons visible vs hidden
  const buttons = await p.evaluate(() => {
    const all = document.querySelectorAll("button");
    const result = [];
    for (const b of all) {
      result.push({
        id: b.id || "",
        text: (b.textContent || "").trim().substring(0, 30),
        visible: !!b.offsetParent,
        display: getComputedStyle(b).display,
        visibility: getComputedStyle(b).visibility,
        opacity: getComputedStyle(b).opacity,
        zIndex: getComputedStyle(b).zIndex
      });
    }
    return result;
  });
  console.log("\nAll buttons:");
  buttons.forEach(b => {
    console.log("  " + (b.visible ? "VIS" : "HID") + " id=" + b.id + " text=" + b.text + " display=" + b.display + " visibility=" + b.visibility + " opacity=" + b.opacity + " z=" + b.zIndex);
  });

  await browser.close();
}
main().catch(e => { console.error("Error:", e.message); });
