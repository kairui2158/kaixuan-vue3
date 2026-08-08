const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
  const page = browser.contexts()[0].pages()[0];
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

  // 1. Check current viewport
  const viewport = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio
  }));
  console.log("[VIEWPORT] " + JSON.stringify(viewport));

  // 2. Check for horizontal overflow (elements wider than viewport)
  const overflow = await page.evaluate(() => {
    const docWidth = document.documentElement.scrollWidth;
    const winWidth = window.innerWidth;
    const issues = [];
    if (docWidth > winWidth) {
      // Find the offending elements
      const all = document.querySelectorAll("*");
      for (let i = 0; i < all.length && i < 500; i++) {
        const el = all[i];
        const r = el.getBoundingClientRect();
        if (r.right > winWidth + 5) {
          issues.push({
            tag: el.tagName,
            id: el.id || "",
            cls: (el.className || "").toString().slice(0, 40),
            right: Math.round(r.right),
            width: Math.round(r.width)
          });
        }
      }
    }
    return { docWidth, winWidth, hasOverflow: docWidth > winWidth, offenders: issues.slice(0, 5) };
  });
  console.log("[OVERFLOW] " + JSON.stringify(overflow, null, 2));

  // 3. Check for elements that are cut off vertically
  const verticalCheck = await page.evaluate(() => {
    const docHeight = document.documentElement.scrollHeight;
    const winHeight = window.innerHeight;
    return { docHeight, winHeight, hasScroll: docHeight > winHeight };
  });
  console.log("[VERTICAL] " + JSON.stringify(verticalCheck));

  // 4. Screenshot main view
  await page.screenshot({ path: `test_evidence/responsive_main_${ts}.png` });

  // 5. Check sidebar width and main content area
  const layout = await page.evaluate(() => {
    const sidebar = document.querySelector("#sidebar, .sidebar, .left-sidebar, nav");
    const main = document.querySelector("#main, .main, .main-content, main");
    const chat = document.querySelector("#chat-panel, .chat-area, .chat");
    const result = {};
    if (sidebar) {
      const r = sidebar.getBoundingClientRect();
      const cs = getComputedStyle(sidebar);
      result.sidebar = { width: Math.round(r.width), minWidth: cs.minWidth, maxWidth: cs.maxWidth };
    }
    if (main) {
      const r = main.getBoundingClientRect();
      result.main = { width: Math.round(r.width), left: Math.round(r.left) };
    }
    if (chat) {
      const r = chat.getBoundingClientRect();
      result.chat = { width: Math.round(r.width) };
    }
    return result;
  });
  console.log("[LAYOUT] " + JSON.stringify(layout, null, 2));

  // 6. Check for text truncation/overflow in buttons
  const textCheck = await page.evaluate(() => {
    const issues = [];
    const btns = document.querySelectorAll("button, .btn");
    for (const b of btns) {
      const cs = getComputedStyle(b);
      if (cs.display === "none") continue;
      const r = b.getBoundingClientRect();
      if (r.width < 10) continue; // Skip tiny buttons
      // Check if text overflows
      const textWidth = b.scrollWidth;
      const visibleWidth = b.clientWidth;
      if (textWidth > visibleWidth + 2) {
        issues.push({
          text: (b.textContent || "").trim().slice(0, 25),
          scrollWidth: textWidth,
          clientWidth: visibleWidth,
          cls: (b.className || "").toString().slice(0, 40)
        });
      }
    }
    return issues.slice(0, 5);
  });
  console.log("[TEXT_OVERFLOW] " + (textCheck.length > 0 ? JSON.stringify(textCheck, null, 2) : "none"));

  await browser.close();
  console.log("[DONE]");
})();
