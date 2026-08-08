const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
  const page = browser.contexts()[0].pages()[0];
  const info = await page.evaluate(() => {
    const results = { btns8: [], btnsTop: [], input8: [] };
    const btns = document.querySelectorAll("button, .btn, [class*=btn]");
    for (let i = 0; i < btns.length; i++) {
      const cs = getComputedStyle(btns[i]);
      const r = cs.borderRadius;
      if (r === "8px") {
        results.btns8.push({
          cls: (btns[i].className || "").slice(0, 50),
          text: (btns[i].textContent || "").trim().slice(0, 30),
          id: btns[i].id || ""
        });
      }
      if (r === "6px 6px 0px 0px") {
        results.btnsTop.push({
          cls: (btns[i].className || "").slice(0, 50),
          text: (btns[i].textContent || "").trim().slice(0, 30),
          id: btns[i].id || ""
        });
      }
    }
    const inputs = document.querySelectorAll("input, textarea, select");
    for (let i = 0; i < inputs.length; i++) {
      const cs = getComputedStyle(inputs[i]);
      if (cs.borderRadius === "8px") {
        results.input8.push({
          tag: inputs[i].tagName,
          id: inputs[i].id || "",
          cls: (inputs[i].className || "").slice(0, 50)
        });
      }
    }
    return results;
  });
  console.log(JSON.stringify(info, null, 2));
  await browser.close();
})();
