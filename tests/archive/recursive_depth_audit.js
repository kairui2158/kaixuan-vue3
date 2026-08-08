const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const browser = await chromium.connectOverCDP("http://127.0.0.1:9223");
  const page = browser.contexts()[0].pages()[0];
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  if (!fs.existsSync("test_evidence")) fs.mkdirSync("test_evidence");

  const results = {
    layers: {
      L1_main: { buttons: 0, inputs: 0, issues: [] },
      L2_panels: {},
      L3_tabs: {},
      L4_subforms: {},
      L5_dialogs: {}
    }
  };

  // Helper: audit all visible buttons/inputs in current view
  async function auditCurrentView(label) {
    return await page.evaluate((lbl) => {
      const visible = (el) => {
        if (!el) return false;
        const cs = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return cs.display !== "none" && cs.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
      };
      const r = { label: lbl, buttons: { total: 0, radiusDist: {}, issues: [] }, inputs: { total: 0, radiusDist: {}, issues: [] }, other: { issues: [] } };

      // Buttons
      const btns = Array.from(document.querySelectorAll("button, .btn, [class*=btn], [role=button]")).filter(visible);
      r.buttons.total = btns.length;
      for (const b of btns) {
        const cs = getComputedStyle(b);
        const rad = cs.borderRadius;
        r.buttons.radiusDist[rad] = (r.buttons.radiusDist[rad] || 0) + 1;
        // Flag non-standard radius (not 6px, 8px, 50%, 99px, 0px for tabs)
        if (rad !== "6px" && rad !== "8px" && rad !== "50%" && rad !== "99px" && rad !== "0px" && rad !== "6px 6px 0px 0px" && rad !== "4px" && rad !== "2px") {
          r.buttons.issues.push({ cls: (b.className || "").slice(0, 50), text: (b.textContent || "").trim().slice(0, 25), radius: rad });
        }
        if (rad === "4px" || rad === "2px") {
          r.buttons.issues.push({ cls: (b.className || "").slice(0, 50), text: (b.textContent || "").trim().slice(0, 25), radius: rad });
        }
        // Check for missing transition
        if (cs.transition === "none" || cs.transition === "all 0s ease 0s") {
          // skip, too many false positives
        }
      }

      // Inputs
      const inputs = Array.from(document.querySelectorAll("input, textarea, select")).filter(visible);
      r.inputs.total = inputs.length;
      for (const inp of inputs) {
        const cs = getComputedStyle(inp);
        const rad = cs.borderRadius;
        const type = inp.type || inp.tagName;
        // Skip checkbox/radio/range (custom styled)
        if (["checkbox", "radio", "range", "file", "hidden", "submit"].includes(type)) continue;
        r.inputs.radiusDist[rad] = (r.inputs.radiusDist[rad] || 0) + 1;
        if (rad !== "6px" && rad !== "8px") {
          r.inputs.issues.push({ tag: inp.tagName, id: inp.id || "", type: type, radius: rad });
        }
      }

      // Other issues: check for hardcoded font sizes, missing shadows on cards, etc.
      const cards = Array.from(document.querySelectorAll(".card, .card-item, [class*=card]")).filter(visible);
      for (const c of cards) {
        const cs = getComputedStyle(c);
        if (cs.boxShadow === "none" && cs.border === "0px none") {
          r.other.issues.push({ type: "card_no_border_no_shadow", cls: (c.className || "").slice(0, 40) });
        }
      }

      return r;
    }, label);
  }

  // Close all modals
  const closeAll = async () => {
    await page.evaluate(() => {
      document.querySelectorAll(".modal.visible, .modal").forEach(m => {
        m.style.display = "none";
        m.classList.remove("visible");
      });
    });
    await page.waitForTimeout(300);
  };

  // === LAYER 1: Main screen ===
  await closeAll();
  await page.waitForTimeout(500);
  const l1 = await auditCurrentView("L1_main");
  results.layers.L1_main = l1;
  await page.screenshot({ path: `test_evidence/recursive_L1_main_${ts}.png` });
  console.log("[L1] buttons:" + l1.buttons.total + " inputs:" + l1.inputs.total + " issues:" + (l1.buttons.issues.length + l1.inputs.issues.length));

  // === LAYER 2: Open each main panel ===
  const panelActions = [
    { name: "settings", selector: "[data-action='settings'], #btn-settings" },
    { name: "pipeline", selector: "[data-action='pipeline'], #btn-pipeline, [data-action='generator']" },
    { name: "sc", selector: "[data-action='settings-collection'], #btn-sc, [data-action='sc']" },
    { name: "outline", selector: "[data-action='outline'], #btn-outline, [data-action='ow']" },
    { name: "memory", selector: "[data-action='memory'], #btn-memory" }
  ];

  for (const panel of panelActions) {
    await closeAll();
    await page.waitForTimeout(200);
    await page.evaluate((sel) => {
      const btn = document.querySelector(sel);
      if (btn) btn.click();
    }, panel.selector);
    await page.waitForTimeout(800);
    const l2 = await auditCurrentView("L2_" + panel.name);
    results.layers.L2_panels[panel.name] = l2;
    await page.screenshot({ path: `test_evidence/recursive_L2_${panel.name}_${ts}.png` });
    console.log("[L2:" + panel.name + "] buttons:" + l2.buttons.total + " inputs:" + l2.inputs.total + " issues:" + (l2.buttons.issues.length + l2.inputs.issues.length));

    // === LAYER 3: Check for tabs inside this panel ===
    const tabs = await page.evaluate(() => {
      const tabEls = document.querySelectorAll(".modal-tab, .tab-bar .tab, .tabs .tab, [role=tab]");
      return Array.from(tabEls).map((t, i) => ({ index: i, text: (t.textContent || "").trim().slice(0, 20), cls: (t.className || "").slice(0, 40) }));
    });

    if (tabs.length > 0) {
      for (let ti = 0; ti < tabs.length; ti++) {
        // Click each tab
        await page.evaluate((idx) => {
          const tabEls = document.querySelectorAll(".modal-tab, .tab-bar .tab, .tabs .tab, [role=tab]");
          if (tabEls[idx]) tabEls[idx].click();
        }, ti);
        await page.waitForTimeout(500);
        const tabName = tabs[ti].text || "tab" + ti;
        const l3 = await auditCurrentView("L3_" + panel.name + "_" + tabName);
        results.layers.L3_tabs[panel.name + "_" + tabName] = l3;
        await page.screenshot({ path: `test_evidence/recursive_L3_${panel.name}_${tabName}_${ts}.png` });
        console.log("[L3:" + panel.name + "/" + tabName + "] buttons:" + l3.buttons.total + " inputs:" + l3.inputs.total + " issues:" + (l3.buttons.issues.length + l3.inputs.issues.length));

        // === LAYER 4: Look for edit/add buttons that open sub-forms ===
        const editBtns = await page.evaluate(() => {
          const btns = document.querySelectorAll("button, .btn");
          const editPatterns = ["编辑", "新增", "添加", "edit", "add", "new", "创建", "+ "];
          return Array.from(btns).filter(b => {
            const txt = (b.textContent || "").trim();
            const cs = getComputedStyle(b);
            return editPatterns.some(p => txt.includes(p)) && cs.display !== "none";
          }).map((b, i) => ({ index: i, text: b.textContent.trim().slice(0, 25), id: b.id || "", cls: (b.className || "").slice(0, 40) }));
        });

        // Click first edit button to open sub-form
        if (editBtns.length > 0) {
          await page.evaluate(() => {
            const btns = document.querySelectorAll("button, .btn");
            const editPatterns = ["编辑", "新增", "添加", "edit", "add", "new", "创建", "+ "];
            const editBtn = Array.from(btns).find(b => {
              const txt = (b.textContent || "").trim();
              return editPatterns.some(p => txt.includes(p));
            });
            if (editBtn) editBtn.click();
          });
          await page.waitForTimeout(600);
          const l4 = await auditCurrentView("L4_" + panel.name + "_" + tabName + "_editform");
          results.layers.L4_subforms[panel.name + "_" + tabName] = l4;
          await page.screenshot({ path: `test_evidence/recursive_L4_${panel.name}_${tabName}_edit_${ts}.png` });
          console.log("[L4:" + panel.name + "/" + tabName + "/edit] buttons:" + l4.buttons.total + " inputs:" + l4.inputs.total + " issues:" + (l4.buttons.issues.length + l4.inputs.issues.length));

          // === LAYER 5: Look for bind/action buttons in the sub-form ===
          const bindBtns = await page.evaluate(() => {
            const btns = document.querySelectorAll("button, .btn");
            const bindPatterns = ["绑定", "bind", "保存", "save", "确认", "confirm", "删除", "delete", "启用", "enable"];
            return Array.from(btns).filter(b => {
              const txt = (b.textContent || "").trim();
              const cs = getComputedStyle(b);
              return bindPatterns.some(p => txt.includes(p)) && cs.display !== "none" && b.getBoundingClientRect().width > 0;
            }).map((b, i) => ({ index: i, text: b.textContent.trim().slice(0, 25), cls: (b.className || "").slice(0, 40) }));
          });

          if (bindBtns.length > 0) {
            // Take screenshot of the action buttons area
            const l5 = await auditCurrentView("L5_" + panel.name + "_" + tabName + "_actions");
            results.layers.L5_dialogs[panel.name + "_" + tabName] = l5;
            await page.screenshot({ path: `test_evidence/recursive_L5_${panel.name}_${tabName}_actions_${ts}.png` });
            console.log("[L5:" + panel.name + "/" + tabName + "/actions] buttons:" + l5.buttons.total + " inputs:" + l5.inputs.total + " issues:" + (l5.buttons.issues.length + l5.inputs.issues.length));
          }
        }

        // Close any opened sub-forms
        await page.evaluate(() => {
          // Close inline editors, popups, etc.
          document.querySelectorAll(".inline-editor, .popup, .dropdown-menu").forEach(e => e.style.display = "none");
        });
      }
    }

    await closeAll();
  }

  // Write full results to file
  fs.writeFileSync("test_evidence/recursive_audit_results.json", JSON.stringify(results, null, 2));
  console.log("\n=== RECURSIVE AUDIT COMPLETE ===");
  console.log("Results saved to test_evidence/recursive_audit_results.json");

  // Summary
  let totalIssues = 0;
  let totalButtons = 0;
  let totalInputs = 0;
  const allLayers = [results.layers.L1_main,
    ...Object.values(results.layers.L2_panels),
    ...Object.values(results.layers.L3_tabs),
    ...Object.values(results.layers.L4_subforms),
    ...Object.values(results.layers.L5_dialogs)
  ];
  for (const layer of allLayers) {
    if (layer.buttons) {
      totalButtons += layer.buttons.total || 0;
      totalIssues += (layer.buttons.issues || []).length;
    }
    if (layer.inputs) {
      totalInputs += layer.inputs.total || 0;
      totalIssues += (layer.inputs.issues || []).length;
    }
    if (layer.other) {
      totalIssues += (layer.other.issues || []).length;
    }
  }
  console.log("Total buttons audited: " + totalButtons);
  console.log("Total inputs audited: " + totalInputs);
  console.log("Total issues found: " + totalIssues);

  await browser.close();
})();
