const { chromium } = require("playwright");
async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9227", { timeout: 5000 });
  const p = browser.contexts()[0]?.pages()[0];
  if (!p) { console.log("No page"); await browser.close(); return; }
  await p.waitForTimeout(800);

  // Check the tree header area for all buttons and clickable elements
  const result = await p.evaluate(() => {
    const tree = document.querySelector("#chapter-tree");
    if (!tree) return "no chapter tree";
    const header = tree.querySelector(".tree-header, #current-project-name");
    if (!header) return "no tree-header";
    const all = header.querySelectorAll("*");
    const items = [];
    for (const el of all) {
      const id = el.id || "";
      const cls = (typeof el.className === "string") ? el.className : "";
      const text = (el.textContent || "").trim();
      const rect = el.getBoundingClientRect();
      items.push({
        tag: el.tagName,
        id,
        class: cls.substring(0, 80),
        visible: !!el.offsetParent,
        display: getComputedStyle(el).display,
        cursor: getComputedStyle(el).cursor,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        text: text.substring(0, 50),
        onclick: !!el.onclick,
        textContent: (el.textContent || "").substring(0, 80)
      });
    }
    // Include header itself
    const hRect = header.getBoundingClientRect();
    items.unshift({
      tag: header.tagName,
      id: header.id || "",
      class: (typeof header.className === "string") ? header.className : "",
      visible: !!header.offsetParent,
      display: getComputedStyle(header).display,
      cursor: getComputedStyle(header).cursor,
      width: Math.round(hRect.width),
      height: Math.round(hRect.height),
      text: (header.textContent || "").substring(0, 80),
      onclick: !!header.onclick
    });
    return { headerHTML: header.outerHTML, items, headerAttr: Array.from(header.attributes).map(a => a.name + "=" + a.value) };
  });

  console.log("Tree header attributes:", JSON.stringify(result.headerAttr, null, 2));
  console.log("\nHeader HTML:", result.headerHTML);
  console.log("\nTree header elements:");
  result.items.forEach(el => {
    console.log(`  <${el.tag} id=${el.id} class=${el.class}>`);
    console.log(`    VIS=${el.visible} display=${el.display} cursor=${el.cursor} ${el.width}x${el.height} onclick=${el.onclick}`);
    console.log(`    text="${el.text}"`);
  });

  // Also check what's around it
  console.log("\n\nFull chapter-tree header context:");
  const context = await p.evaluate(() => {
    const tree = document.querySelector("#chapter-tree");
    const treeHTML = tree.innerHTML.substring(0, 500);
    return treeHTML;
  });
  console.log(context);

  await browser.close();
}
main().catch(e => { console.error("Error:", e.message); });
