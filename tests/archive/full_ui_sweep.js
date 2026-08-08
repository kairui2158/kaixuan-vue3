const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9223');
  const page = browser.contexts()[0].pages()[0];
  await page.waitForTimeout(800);

  const report = {
    timestamp: new Date().toISOString(),
    viewport: await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight })),
    issues: []
  };

  // 1. ELEMENT OVERFLOW
  const overflow = await page.evaluate(() => {
    const issues = [];
    const all = document.querySelectorAll('*');
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let count = 0;
    for (const el of all) {
      if (count++ > 3000) break;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (r.right > vw + 5) {
        issues.push({ type: 'overflow_right', id: (el.id||el.tagName), right: Math.round(r.right), vw });
      }
      if (r.bottom > vh + 5) {
        issues.push({ type: 'overflow_bottom', id: (el.id||el.tagName), bottom: Math.round(r.bottom), vh });
      }
      if (r.left < -5 && r.width < vw) {
        issues.push({ type: 'offscreen_left', id: (el.id||el.tagName), left: Math.round(r.left) });
      }
    }
    return issues.slice(0, 30);
  });
  report.issues.push(...overflow.map(i => ({ category: 'OVERFLOW', ...i })));

  // 2. CONTENT CLIPPING
  const clipping = await page.evaluate(() => {
    const issues = [];
    const containers = document.querySelectorAll('div, section, aside, main');
    let count = 0;
    for (const c of containers) {
      if (count++ > 500) break;
      const cs = getComputedStyle(c);
      if (cs.overflow === 'hidden' || cs.overflowY === 'hidden' || cs.overflowX === 'hidden') {
        const r = c.getBoundingClientRect();
        if (r.width < 50 || r.height < 50) continue;
        if (c.scrollHeight > c.clientHeight + 5 && cs.overflowY === 'hidden') {
          issues.push({ type: 'content_clipped', id: (c.id||c.tagName), scrollH: c.scrollHeight, clientH: c.clientHeight, diff: c.scrollHeight - c.clientHeight });
        }
      }
    }
    return issues.slice(0, 20);
  });
  report.issues.push(...clipping.map(i => ({ category: 'CLIPPING', ...i })));

  // 3. BUTTON ISSUES
  const buttonIssues = await page.evaluate(() => {
    const issues = [];
    const btns = document.querySelectorAll('button, .btn, [role=button]');
    let count = 0;
    for (const b of btns) {
      if (count++ > 500) break;
      const r = b.getBoundingClientRect();
      const cs = getComputedStyle(b);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      if (r.width === 0 || r.height === 0) {
        issues.push({ type: 'zero_size_btn', id: (b.id||''), text: (b.textContent||'').trim().slice(0,15) });
      } else if (r.width < 20 || r.height < 16) {
        issues.push({ type: 'tiny_btn', id: (b.id||''), text: (b.textContent||'').trim().slice(0,15), w: Math.round(r.width), h: Math.round(r.height) });
      }
      if (r.width > 0 && r.width < 200) {
        const text = (b.textContent || '').trim();
        if (text.length > 0 && text.length * 8 > r.width) {
          const ts = getComputedStyle(b);
          if (ts.textOverflow !== 'ellipsis' && ts.whiteSpace === 'nowrap') {
            issues.push({ type: 'text_overflow_btn', id: (b.id||''), text: text.slice(0,20), w: Math.round(r.width) });
          }
        }
      }
    }
    return issues.slice(0, 25);
  });
  report.issues.push(...buttonIssues.map(i => ({ category: 'BUTTON', ...i })));

  // 4. Z-INDEX CONFLICTS
  const zConflicts = await page.evaluate(() => {
    const zMap = {};
    const all = document.querySelectorAll('*');
    let count = 0;
    for (const el of all) {
      if (count++ > 2000) break;
      const cs = getComputedStyle(el);
      const z = parseInt(cs.zIndex);
      if (isNaN(z) || z < 10) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (!zMap[z]) zMap[z] = [];
      if (zMap[z].length < 5) {
        zMap[z].push({ id: (el.id||el.tagName), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) });
      }
    }
    const conflicts = [];
    for (const z of Object.keys(zMap)) {
      const els = zMap[z];
      if (els.length > 1) {
        for (let i = 0; i < els.length; i++) {
          for (let j = i+1; j < els.length; j++) {
            const a = els[i], b = els[j];
            if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
              conflicts.push({ z: z, a: a.id, b: b.id });
            }
          }
        }
      }
    }
    return conflicts.slice(0, 15);
  });
  report.issues.push(...zConflicts.map(i => ({ category: 'Z_CONFLICT', ...i })));

  // 5. FONT SIZE INCONSISTENCY
  const fontAudit = await page.evaluate(() => {
    const sizes = {};
    const els = document.querySelectorAll('span, p, label, button, a, td, th, div, h1, h2, h3, h4, input, textarea, select');
    let count = 0;
    for (const el of els) {
      if (count++ > 800) break;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const fs = cs.fontSize;
      sizes[fs] = (sizes[fs] || 0) + 1;
    }
    const sizeList = Object.entries(sizes).sort((a,b) => b[1] - a[1]);
    return { distinctCount: sizeList.length, sizes: sizeList.slice(0, 15), inconsistent: sizeList.length > 8 };
  });
  if (fontAudit.inconsistent) {
    report.issues.push({ category: 'FONT', type: 'too_many_sizes', count: fontAudit.distinctCount, sizes: fontAudit.sizes.map(s => s[0] + ':' + s[1]) });
  }

  // 6. SPACING INCONSISTENCY
  const spacingAudit = await page.evaluate(() => {
    const paddings = {};
    const gaps = {};
    const containers = document.querySelectorAll('div, section, aside, main, header, footer');
    let count = 0;
    for (const c of containers) {
      if (count++ > 500) break;
      const cs = getComputedStyle(c);
      const r = c.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (cs.display.includes('flex') || cs.display.includes('grid')) {
        if (cs.gap && cs.gap !== 'normal' && cs.gap !== '0px') {
          gaps[cs.gap] = (gaps[cs.gap] || 0) + 1;
        }
      }
      const p = cs.padding;
      if (p !== '0px') paddings[p] = (paddings[p] || 0) + 1;
    }
    const gapList = Object.entries(gaps).sort((a,b) => b[1] - a[1]);
    const padList = Object.entries(paddings).sort((a,b) => b[1] - a[1]);
    return { gapCount: gapList.length, gaps: gapList.slice(0, 10), paddingCount: padList.length, paddings: padList.slice(0, 10), gapInconsistent: gapList.length > 6, padInconsistent: padList.length > 8 };
  });
  if (spacingAudit.gapInconsistent) {
    report.issues.push({ category: 'SPACING', type: 'gap_inconsistent', count: spacingAudit.gapCount, values: spacingAudit.gaps.map(g => g[0] + '(' + g[1] + ')') });
  }
  if (spacingAudit.padInconsistent) {
    report.issues.push({ category: 'SPACING', type: 'padding_inconsistent', count: spacingAudit.paddingCount, values: spacingAudit.paddings.map(p => p[0] + '(' + p[1] + ')') });
  }

  // 7. COLOR CONTRAST
  const contrastIssues = await page.evaluate(() => {
    const issues = [];
    const els = document.querySelectorAll('span, p, label, button, a, td, th, h1, h2, h3, h4, h5, h6');
    let count = 0;
    for (const el of els) {
      if (count++ > 400) break;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const color = cs.color;
      const parent = el.parentElement;
      if (!parent) continue;
      const pcs = getComputedStyle(parent);
      const bg = pcs.backgroundColor;
      if (color === bg && color !== 'rgba(0, 0, 0, 0)') {
        issues.push({ type: 'invisible_text', id: (el.id||el.tagName), text: (el.textContent||'').trim().slice(0,20), color: color.slice(0,30) });
      }
      if (parseFloat(cs.opacity) < 0.3 && parseFloat(cs.opacity) > 0) {
        issues.push({ type: 'low_opacity', id: (el.id||el.tagName), opacity: cs.opacity });
      }
    }
    return issues.slice(0, 15);
  });
  report.issues.push(...contrastIssues.map(i => ({ category: 'CONTRAST', ...i })));

  // 8. SCROLL CONTAINERS
  const scrollIssues = await page.evaluate(() => {
    const issues = [];
    const containers = document.querySelectorAll('[class*=scroll], [class*=list], [class*=messages], [class*=content], [class*=panel], [class*=body]');
    let count = 0;
    for (const c of containers) {
      if (count++ > 300) break;
      const cs = getComputedStyle(c);
      const r = c.getBoundingClientRect();
      if (r.height < 50) continue;
      if (c.scrollHeight > c.clientHeight + 20) {
        if (cs.overflowY === 'hidden' || cs.overflowY === 'visible') {
          issues.push({ type: 'no_scroll_overflow', id: (c.id||c.className.toString().slice(0,25)), scrollH: c.scrollHeight, clientH: c.clientHeight, overflowY: cs.overflowY });
        }
      }
    }
    return issues.slice(0, 15);
  });
  report.issues.push(...scrollIssues.map(i => ({ category: 'SCROLL', ...i })));

  // 9. EMPTY CONTAINERS
  const emptyContainers = await page.evaluate(() => {
    const issues = [];
    const els = document.querySelectorAll('div, section, aside');
    let count = 0;
    for (const el of els) {
      if (count++ > 500) break;
      const r = el.getBoundingClientRect();
      if (r.width < 100 || r.height < 100) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none') continue;
      let hasContent = false;
      for (const child of el.children) {
        const cr = child.getBoundingClientRect();
        if (cr.width > 5 && cr.height > 5) { hasContent = true; break; }
      }
      const text = (el.textContent || '').trim();
      if (!hasContent && text.length < 3) {
        issues.push({ type: 'empty_container', id: (el.id||el.tagName), cls: (el.className||'').toString().slice(0,25), w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) });
      }
    }
    return issues.slice(0, 15);
  });
  report.issues.push(...emptyContainers.map(i => ({ category: 'EMPTY_SPACE', ...i })));

  // 10. RESPONSIVE BREAKPOINTS
  const vp = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const widths = [1920, 1600, 1366, 1280, 1024];
  for (const w of widths) {
    if (w === vp.w) continue;
    try {
      await page.setViewportSize({ width: w, height: 975 }).catch(()=>{});
      await page.waitForTimeout(500);
      const diag = await page.evaluate(() => {
        const editor = document.querySelector('#editor-content');
        const tree = document.querySelector('#chapter-tree');
        const chat = document.querySelector('#chat-panel');
        const issues = [];
        if (editor) {
          const r = editor.getBoundingClientRect();
          if (r.width < 300) issues.push('editor_too_narrow:' + Math.round(r.width));
        }
        if (tree) {
          const r = tree.getBoundingClientRect();
          if (r.width > 400) issues.push('tree_too_wide:' + Math.round(r.width));
        }
        if (chat) {
          const r = chat.getBoundingClientRect();
          if (r.x + r.width > window.innerWidth + 5) issues.push('chat_overflow');
        }
        if (document.documentElement.scrollWidth > window.innerWidth + 5) {
          issues.push('horizontal_scrollbar');
        }
        return issues;
      });
      for (const d of diag) {
        report.issues.push({ category: 'RESPONSIVE', width: w, issue: d });
      }
    } catch(e) {}
  }
  await page.setViewportSize({ width: vp.w, height: vp.h }).catch(()=>{});

  // OUTPUT
  console.log(JSON.stringify(report, null, 1));
  fs.writeFileSync('test_evidence/ui_sweep_report.json', JSON.stringify(report, null, 2), 'utf8');
  console.log('[SAVED] test_evidence/ui_sweep_report.json');

  const byCategory = {};
  for (const issue of report.issues) {
    byCategory[issue.category] = (byCategory[issue.category] || 0) + 1;
  }
  console.log('\\n=== SUMMARY ===');
  for (const cat of Object.keys(byCategory)) {
    console.log(cat + ': ' + byCategory[cat] + ' issues');
  }
  console.log('Total: ' + report.issues.length + ' issues');

  await browser.close();
})();
