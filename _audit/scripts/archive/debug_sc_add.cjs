const { chromium } = require("playwright");

async function main() {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9227");
  const ctx = browser.contexts()[0];
  const page = ctx.pages().find((p) => p.url().startsWith("file:"));
  if (!page) throw new Error("file page not found");
  await page.waitForTimeout(1000);

  // Open pipeline to step 2
  const plAlreadyOpen = await page.evaluate(() => !!document.querySelector("#pipeline-panel"));
  if (!plAlreadyOpen) {
    const btnInfo = await page.evaluate(() => {
      const btn = document.querySelector("#btn-pipeline");
      if (btn) btn.click();
      return { btnFound: !!btn, btnId: btn?.id || "", btnClass: btn?.className || "" };
    });
    console.log("btnInfo:", JSON.stringify(btnInfo));
  } else {
    console.log("pipeline already open, skipping click");
  }
  await page.waitForTimeout(800);
  const plOpen2 = await page.evaluate(() => !!document.querySelector("#pipeline-panel"));
  console.log("pipelineOpenAfter:", plOpen2);
  const plOpen = await page.evaluate(() => !!document.querySelector("#pipeline-panel"));
  console.log("pipelineOpen:", plOpen);
  const currentStep = await page.evaluate(() => {
    const active = document.querySelector(".pl-step.active");
    return active ? active.textContent : "none";
  });
  console.log("currentStep:", currentStep);
  await page.evaluate(() => {
    const steps = document.querySelectorAll(".pl-step");
    if (steps.length > 1) steps[1].click();
  });
  await page.waitForTimeout(300);
  const step2Visible = await page.evaluate(() => {
    const panel = document.querySelector("#pl-step-2-content");
    return panel ? getComputedStyle(panel).display : "not found";
  });
  console.log("step2 display:", step2Visible);

  // Open add setting modal
  await page.evaluate(() => {
    const btns = document.querySelectorAll("#pl-step-2-content .pl-actions button");
    btns.forEach((b) => {
      if (b.textContent.includes("新增设定")) b.click();
    });
  });
  await page.waitForTimeout(500);
  const modalOpen = await page.evaluate(() => !!document.querySelector(".pl-add-setting-modal"));
  console.log("modalOpen:", modalOpen);

  // Inspect modal
  const info = await page.evaluate(() => {
    const modal = document.querySelector(".pl-add-setting-modal");
    if (!modal) return { error: "modal not found" };
    const inputs = Array.from(modal.querySelectorAll("input, select, textarea, button")).map((el) => ({
      tag: el.tagName,
      cls: el.className,
      type: el.getAttribute("type") || "",
      placeholder: el.getAttribute("placeholder") || "",
      value: el.value || "",
      text: el.textContent.trim().slice(0, 30)
    }));
    return { inputs };
  });
  console.log(JSON.stringify(info, null, 2));

  // Try setting values via native setters and dispatch input events
  await page.locator(".pl-add-setting-modal .pl-input").fill("调试设定");
  await page.locator(".pl-add-setting-modal textarea").fill("调试属性内容");
  await page.waitForTimeout(300);
  const setResult = await page.evaluate(() => {
    const modal = document.querySelector(".pl-add-setting-modal");
    if (!modal) return "no modal";
    const nameInput = modal.querySelector(".pl-input");
    const ta = modal.querySelector("textarea");
    return {
      nameVal: nameInput ? nameInput.value : "no input",
      taVal: ta ? ta.value : "no ta",
      saveDisabled: modal.querySelector(".btn-primary")?.disabled
    };
  });
  console.log("setResult:", JSON.stringify(setResult));

  // Try clicking save button
  await page.evaluate(() => {
    const btn = document.querySelector(".pl-add-setting-footer .btn-primary");
    if (btn) btn.click();
  });
  await page.waitForTimeout(800);

  // Check if modal closed and item was added
  const after = await page.evaluate(() => {
    const modal = document.querySelector(".pl-add-setting-modal");
    const items = Array.from(document.querySelectorAll(".pl-setting-item")).map((el) => el.textContent.trim().slice(0, 50));
    return {
      modalOpen: !!modal,
      items,
      scItems: JSON.parse(localStorage.getItem("wa_project") || "{}") 
    };
  });
  console.log("after:", JSON.stringify(after, null, 2));

  await browser.close();
}

main().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
