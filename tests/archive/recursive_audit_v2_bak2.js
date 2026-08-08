const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
  const page = browser.contexts()[0].pages()[0];
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  if (!fs.existsSync("test_evidence")) fs.mkdirSync("test_evidence");

  const report = [];

  async function waitForStable(timeoutMs) {
    if (!timeoutMs) timeoutMs = 15000;
    let prevCount = 0; let stableCount = 0; const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const count = await page.evaluate(() => document.querySelectorAll("*").length);
      if (count === prevCount) { stableCount++; if (stableCount >= 3) return true; } else { stableCount = 0; }
      prevCount = count;
      await page.waitForTimeout(300);
    }
    return false;
  }
  async function hardReset() {
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForStable(20000);
    await waitForStable(8000);
  }

  async function auditVisible(label, depth) {
    return await page.evaluate(({ lbl, d }) => {
      const isVisible = (el) => {
        if (!el || !el.tagName) return false;
        const cs = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return cs.display !== "none" && cs.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };

      const r = { label: lbl, depth: d, buttons: [], inputs: [], dynamic: [], issues: [] };

      const allBtns = Array.from(document.querySelectorAll("button, .btn, [class*=btn], [role=button], input[type=button], input[type=submit]"));
      const visBtns = allBtns.filter(isVisible);

      for (const b of visBtns) {
        const cs = getComputedStyle(b);
        const rad = cs.borderRadius;
        const cls = (b.className || "").toString().slice(0, 60);
        const text = (b.textContent || "").trim().slice(0, 30);
        const id = b.id || "";
        const isDynamic = !id && (cls.includes("item") || cls.includes("action") || cls.includes("toggle") || cls === "");
        r.buttons.push({ cls, text, id, radius: rad, dynamic: isDynamic });
        if (rad === "4px" || rad === "2px" || rad === "3px") {
          r.issues.push({ type: "btn_bad_radius", cls, text, radius: rad });
        }
      }

      const allInputs = Array.from(document.querySelectorAll("input, textarea, select"));
      const visInputs = allInputs.filter(isVisible).filter(el => {
        const type = el.type || el.tagName;
        return !["checkbox", "radio", "range", "file", "hidden", "submit", "button"].includes(type);
      });
      for (const inp of visInputs) {
        const cs = getComputedStyle(inp);
        const rad = cs.borderRadius;
        const type = inp.type || inp.tagName;
        const id = inp.id || "";
        const cls = (inp.className || "").toString().slice(0, 60);
        r.inputs.push({ tag: inp.tagName, type, id, cls, radius: rad });
        if (rad === "4px" || rad === "2px" || rad === "3px") {
          r.issues.push({ type: "input_bad_radius", tag: inp.tagName, id, radius: rad });
        }
      }

      const dynamicContainers = document.querySelectorAll("[data-dynamic], .dynamic-content, .generated-content, .list-item, .sc-item, .mem-item, .pl-item, .chapter-item, .sc-card, .mem-card, .agent-card, .skill-card");
      const visDynamic = Array.from(dynamicContainers).filter(isVisible);
      for (const dc of visDynamic) {
        const innerBtns = dc.querySelectorAll("button, .btn, [class*=btn]");
        for (const ib of innerBtns) {
          if (!isVisible(ib)) continue;
          const cs = getComputedStyle(ib);
          const rad = cs.borderRadius;
          const cls = (ib.className || "").toString().slice(0, 50);
          const text = (ib.textContent || "").trim().slice(0, 20);
          r.dynamic.push({ parent: (dc.className || "").slice(0, 30), cls, text, radius: rad });
          if (rad === "4px" || rad === "2px" || rad === "3px" || rad === "0px") {
            r.issues.push({ type: "dynamic_btn_bad_radius", parent: (dc.className || "").slice(0, 30), cls, text, radius: rad });
          }
        }
      }

      r.buttonCount = r.buttons.length;
      r.inputCount = r.inputs.length;
      r.dynamicCount = r.dynamic.length;
      r.issueCount = r.issues.length;
      return r;
    }, { lbl: label, d: depth });
  }

  // LAYER 1: Main
  await hardReset();
  const l1 = await auditVisible("L1_main", 1);
  report.push(l1);
  await page.screenshot({ path: `test_evidence/recursive_v2_L1_main_${ts}.png` });
  console.log(`[L1] btns:${l1.buttonCount} inputs:${l1.inputCount} dynamic:${l1.dynamicCount} issues:${l1.issueCount}`);

  // LAYER 2: Settings
  await hardReset();
  await page.evaluate(() => { const b = document.querySelector("[data-action='settings'], #btn-settings"); if (b) b.click(); });
  await waitForStable(12000);
  const l2s = await auditVisible("L2_settings", 2);
  report.push(l2s);
  await page.screenshot({ path: `test_evidence/recursive_v2_L2_settings_${ts}.png` });
  console.log(`[L2:settings] btns:${l2s.buttonCount} inputs:${l2s.inputCount} dynamic:${l2s.dynamicCount} issues:${l2s.issueCount}`);

  // LAYER 3: Settings > Skills tab
  await page.evaluate(() => { const tabs = document.querySelectorAll(".modal-tab"); if (tabs[1]) tabs[1].click(); });
  await waitForStable(8000);
  const l3sk = await auditVisible("L3_settings_skills", 3);
  report.push(l3sk);
  await page.screenshot({ path: `test_evidence/recursive_v2_L3_skills_${ts}.png` });
  console.log(`[L3:skills] btns:${l3sk.buttonCount} inputs:${l3sk.inputCount} dynamic:${l3sk.dynamicCount} issues:${l3sk.issueCount}`);

  // LAYER 3: Settings > Agents tab
  await page.evaluate(() => { const tabs = document.querySelectorAll(".modal-tab"); if (tabs[2]) tabs[2].click(); });
  await waitForStable(8000);
  const l3ag = await auditVisible("L3_settings_agents", 3);
  report.push(l3ag);
  await page.screenshot({ path: `test_evidence/recursive_v2_L3_agents_${ts}.png` });
  console.log(`[L3:agents] btns:${l3ag.buttonCount} inputs:${l3ag.inputCount} dynamic:${l3ag.dynamicCount} issues:${l3ag.issueCount}`);

  // LAYER 4: Settings > Skills > Click edit button
  await page.evaluate(() => { const tabs = document.querySelectorAll(".modal-tab"); if (tabs[1]) tabs[1].click(); });
  await waitForStable(8000);
  const editClicked = await page.evaluate(() => {
    const btns = document.querySelectorAll("button, .btn");
    for (const b of btns) {
      const txt = (b.textContent || "").trim();
      const cs = getComputedStyle(b);
      if ((txt.includes("编辑") || txt.includes("新增") || txt.includes("添加")) && cs.display !== "none" && b.getBoundingClientRect().width > 0) {
        b.click();
        return txt.slice(0, 20);
      }
    }
    return null;
  });
  if (editClicked) {
    await waitForStable(9000);
    const l4 = await auditVisible("L4_skills_edit", 4);
    report.push(l4);
    await page.screenshot({ path: `test_evidence/recursive_v2_L4_skills_edit_${ts}.png` });
    console.log(`[L4:skills/edit] btns:${l4.buttonCount} inputs:${l4.inputCount} dynamic:${l4.dynamicCount} issues:${l4.issueCount}`);
  }

  // LAYER 2: Pipeline
  await hardReset();
  await page.evaluate(() => { const b = document.querySelector("[data-action='pipeline'], [data-action='generator']"); if (b) b.click(); });
  await waitForStable(12000);
  const l2p = await auditVisible("L2_pipeline", 2);
  report.push(l2p);
  await page.screenshot({ path: `test_evidence/recursive_v2_L2_pipeline_${ts}.png` });
  console.log(`[L2:pipeline] btns:${l2p.buttonCount} inputs:${l2p.inputCount} dynamic:${l2p.dynamicCount} issues:${l2p.issueCount}`);

  // LAYER 3: Pipeline > Click first step
  const stepClicked = await page.evaluate(() => {
    const steps = document.querySelectorAll(".pl-step");
    for (const s of steps) {
      const cs = getComputedStyle(s);
      if (cs.display !== "none" && s.getBoundingClientRect().width > 0) { s.click(); return (s.textContent || "").trim().slice(0, 20); }
    }
    return null;
  });
  if (stepClicked) {
    await waitForStable(8000);
    const l3p = await auditVisible("L3_pipeline_step", 3);
    report.push(l3p);
    await page.screenshot({ path: `test_evidence/recursive_v2_L3_pipeline_${ts}.png` });
    console.log(`[L3:pipeline/step] btns:${l3p.buttonCount} inputs:${l3p.inputCount} dynamic:${l3p.dynamicCount} issues:${l3p.issueCount}`);

    // LAYER 4: Pipeline > Generate button
    const genClicked = await page.evaluate(() => {
      const btns = document.querySelectorAll("button, .btn");
      for (const b of btns) {
        const txt = (b.textContent || "").trim();
        const cs = getComputedStyle(b);
        if ((txt.includes("生成") || txt.includes("添加")) && cs.display !== "none" && b.getBoundingClientRect().width > 0) {
          b.click(); return txt.slice(0, 20);
        }
      }
      return null;
    });
    if (genClicked) {
      await waitForStable(9000);
      const l4p = await auditVisible("L4_pipeline_gen", 4);
      report.push(l4p);
      await page.screenshot({ path: `test_evidence/recursive_v2_L4_pipeline_gen_${ts}.png` });
      console.log(`[L4:pipeline/gen] btns:${l4p.buttonCount} inputs:${l4p.inputCount} dynamic:${l4p.dynamicCount} issues:${l4p.issueCount}`);
    }
  }

  // LAYER 2: Settings Collection
  await hardReset();
  await page.evaluate(() => { const b = document.querySelector("[data-action='settings-collection'], [data-action='sc']"); if (b) b.click(); });
  await waitForStable(12000);
  const l2sc = await auditVisible("L2_sc", 2);
  report.push(l2sc);
  await page.screenshot({ path: `test_evidence/recursive_v2_L2_sc_${ts}.png` });
  console.log(`[L2:sc] btns:${l2sc.buttonCount} inputs:${l2sc.inputCount} dynamic:${l2sc.dynamicCount} issues:${l2sc.issueCount}`);

  // LAYER 3: SC > Category
  const catClicked = await page.evaluate(() => {
    const cats = document.querySelectorAll(".sc-cat-btn");
    for (const c of cats) {
      const cs = getComputedStyle(c);
      if (cs.display !== "none" && c.getBoundingClientRect().width > 0) { c.click(); return (c.textContent || "").trim().slice(0, 20); }
    }
    return null;
  });
  if (catClicked) {
    await waitForStable(8000);
    const l3sc = await auditVisible("L3_sc_cat", 3);
    report.push(l3sc);
    await page.screenshot({ path: `test_evidence/recursive_v2_L3_sc_${ts}.png` });
    console.log(`[L3:sc/cat] btns:${l3sc.buttonCount} inputs:${l3sc.inputCount} dynamic:${l3sc.dynamicCount} issues:${l3sc.issueCount}`);

    // LAYER 4: SC > Add item
    const itemClicked = await page.evaluate(() => {
      const btns = document.querySelectorAll("button, .btn");
      for (const b of btns) {
        const txt = (b.textContent || "").trim();
        const cs = getComputedStyle(b);
        if ((txt.includes("添加") || txt.includes("新增") || txt.includes("+")) && cs.display !== "none" && b.getBoundingClientRect().width > 0) {
          b.click(); return txt.slice(0, 20);
        }
      }
      return null;
    });
    if (itemClicked) {
      await waitForStable(9000);
      const l4sc = await auditVisible("L4_sc_item", 4);
      report.push(l4sc);
      await page.screenshot({ path: `test_evidence/recursive_v2_L4_sc_${ts}.png` });
      console.log(`[L4:sc/item] btns:${l4sc.buttonCount} inputs:${l4sc.inputCount} dynamic:${l4sc.dynamicCount} issues:${l4sc.issueCount}`);

      // LAYER 5: SC > Item > Actions
      const l5sc = await auditVisible("L5_sc_actions", 5);
      report.push(l5sc);
      await page.screenshot({ path: `test_evidence/recursive_v2_L5_sc_${ts}.png` });
      console.log(`[L5:sc/actions] btns:${l5sc.buttonCount} inputs:${l5sc.inputCount} dynamic:${l5sc.dynamicCount} issues:${l5sc.issueCount}`);
    }
  }

  // LAYER 2: Memory
  await hardReset();
  await page.evaluate(() => { const b = document.querySelector("[data-action='memory'], #btn-memory"); if (b) b.click(); });
  await waitForStable(12000);
  const l2m = await auditVisible("L2_memory", 2);
  report.push(l2m);
  await page.screenshot({ path: `test_evidence/recursive_v2_L2_memory_${ts}.png` });
  console.log(`[L2:memory] btns:${l2m.buttonCount} inputs:${l2m.inputCount} dynamic:${l2m.dynamicCount} issues:${l2m.issueCount}`);

  // SUMMARY
  fs.writeFileSync("test_evidence/recursive_audit_v2_results.json", JSON.stringify(report, null, 2));
  console.log("\n=== RECURSIVE AUDIT V2 COMPLETE ===");
  let tb = 0, ti = 0, td = 0, tiss = 0;
  for (const r of report) {
    tb += r.buttonCount || 0; ti += r.inputCount || 0; td += r.dynamicCount || 0; tiss += r.issueCount || 0;
    if (r.issues && r.issues.length > 0) {
      console.log(`  [${r.label}] ${r.issues.length} issues:`);
      for (const iss of r.issues.slice(0, 5)) console.log(`    - ${iss.type}: ${iss.cls || iss.id || ""} radius=${iss.radius || ""}`);
    }
  }
  console.log(`\nTotal: ${tb} buttons, ${ti} inputs, ${td} dynamic, ${tiss} issues across ${report.length} layers`);
  await browser.close();
})();
