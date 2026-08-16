const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{try{resolve(JSON.parse(d))}catch(e){reject(e)}});
  }).on('error', reject);
  });
}

async function main() {
  const pages = await fetchJSON('http://127.0.0.1:9227/json');
  const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise((r, rej) => { ws.on('open', r); ws.on('error', rej); });
  let msgId = 1;
  function send(method, params) {
    const id = msgId++;
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ error: 'timeout' }), 10000);
      const handler = (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.id === id) { clearTimeout(timer); ws.removeListener('message', handler); resolve(msg); }
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  await send('Page.enable');
  await send('Runtime.enable');
  await new Promise(r => setTimeout(r, 1000));

  async function evalJS(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return r.result && r.result.result ? r.result.result.value : 'FAIL';
  }

  // 1. Check current UI state - what overlays are visible?
  console.log('=== CURRENT UI STATE ===');
  console.log(await evalJS('(function(){ let els = document.querySelectorAll(".ow-overlay, .pl-overlay, .sc-overlay, .modal-overlay, .panel-backdrop, [class*=overlay]"); let out = []; els.forEach(el=>{ let cs = window.getComputedStyle(el); out.push({tag:el.tagName, cls:el.className.slice(0,50), display:cs.display, visibility:cs.visibility, opacity:cs.opacity, position:cs.position, zIndex:cs.zIndex, rect: el.getBoundingClientRect().width + "x" + el.getBoundingClientRect().height}); }); return out; })()'));

  // 2. Check activePanel indirectly - is there a panel-backdrop?
  console.log('\\n=== PANEL BACKDROP ===');
  console.log(await evalJS('(function(){ let el = document.querySelector(".panel-backdrop"); if(!el) return "NONE"; let cs = window.getComputedStyle(el); return {display:cs.display, visibility:cs.visibility, opacity:cs.opacity, zIndex:cs.zIndex, rect:el.getBoundingClientRect().width + "x" + el.getBoundingClientRect().height}; })()'));

  // 3. Check what's actually on screen
  console.log('\\n=== VISIBLE PANELS (based on computed style) ===');
  console.log(await evalJS('(function(){ let all = document.querySelectorAll("div"); let visible = []; all.forEach(el=>{ let cs = window.getComputedStyle(el); let rect = el.getBoundingClientRect(); if(cs.display !== "none" && cs.visibility !== "hidden" && rect.width > 0 && rect.height > 0 && (el.className || "").toString().includes("overlay")) { visible.push({tag:el.tagName, cls:el.className.slice(0,60), pos:cs.position, zIndex:cs.zIndex, rect: Math.round(rect.width) + "x" + Math.round(rect.height) + "@" + Math.round(rect.x) + "," + Math.round(rect.y)}); } }); return visible; })()'));

  // 4. Check button visibility rules
  console.log('\\n=== BUTTON VISIBILITIES WITH CSS ===');
  console.log(await evalJS('(function(){ let btns = document.querySelectorAll("button"); let out = []; btns.forEach(b=>{ let cs = window.getComputedStyle(b); let rect = b.getBoundingClientRect(); if(!b.id && !b.textContent.trim()) return; if(cs.display==="none" || cs.visibility==="hidden" || rect.width===0 || rect.height===0) { out.push({id:b.id||"", text:b.textContent.trim().slice(0,20), display:cs.display, vis:cs.visibility, w:Math.round(rect.width), h:Math.round(rect.height)}); } }); return {total:btns.length, hidden: out.length, details: out.slice(0,30)}; })()'));

  // 5. Check window.electronAPI state
  console.log('\\n=== API METHODS ===');
  console.log(await evalJS('Object.keys(window.electronAPI || {}).join(", ")'));

  // 6. Check if any modal is covering
  console.log('\\n=== TOP-MOST ELEMENT ===');
  console.log(await evalJS('(function(){ let all = document.querySelectorAll("div, section, aside, main"); let top = null; let topZ = -9999; all.forEach(el=>{ let cs = window.getComputedStyle(el); if(cs.display==="none" || cs.visibility==="hidden") return; let z = parseInt(cs.zIndex) || 0; if(z > topZ) { topZ = z; top = {tag:el.tagName, cls:el.className.slice(0,60), z:z}; } }); return {top, topZ}; })()'));

  ws.close();
}
main().catch(e => console.log('FATAL: ' + e.message));
