const { chromium } = require("playwright");
async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9227", { timeout: 5000 });
  const p = browser.contexts()[0]?.pages()[0];
  if (!p) { console.log("No page"); await browser.close(); return; }

  // List all elements in chapter-tree with their visibility
  const result = await p.evaluate(() => {
    const tree = document.querySelector("#chapter-tree");
    if (!tree) return "no chapter tree";
    const all = tree.querySelectorAll("*");
    const items = [];
    for (const el of all) {
      const id = el.id || "";
      const cls = (typeof el.className === "string") ? el.className : "";
      const text = (el.textContent || "").trim();
      const rect = el.getBoundingClientRect();
      items.push({
        tag: el.tagName,
        id,
        class: cls.substring(0, 60),
        visible: !!el.offsetParent,
        display: getComputedStyle(el).display,
        visibility: getComputedStyle(el).visibility,
        opacity: getComputedStyle(el).opacity,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        text: text.substring(0, 40)
      });
    }
    return items;
  });

  console.log("=== #chapter-tree 全部元素 ===\n");
  result.forEach(el => {
    console.log(`  <${el.tag} ${el.id ? "id="+el.id : ""} ${el.class ? "class="+el.class : ""}>`);
    console.log(`    VIS=${el.visible} display=${el.display} visibility=${el.visibility} opacity=${el.opacity} ${el.width}x${el.height}`);
    console.log(`    text="${el.text}"`);
  });

  await browser.close();
}
main().catch(e => { console.error("Error:", e.message); });
