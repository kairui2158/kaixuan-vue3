const { chromium } = require("playwright");
const { execSync } = require("child_process");

async function main() {
  // start Electron
  execSync("start cmd /c start-electron.bat", { cwd: "D:\\codex\\novel-workshop-vue3" });
  await new Promise(r => setTimeout(r, 6000));
  const b = await chromium.connectOverCDP("http://localhost:9227");
  const p = b.contexts()[0].pages()[0];
  await new Promise(r => setTimeout(r, 2000));
  // clean localStorage
  const keys = await p.evaluate(() => {
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.includes("__audit_temp_project__")) toRemove.push(k);
    }
    toRemove.forEach(k => localStorage.removeItem(k));
    return { removed: toRemove.length, keys: toRemove };
  });
  console.log("Cleaned localStorage keys:", JSON.stringify(keys));
  await b.close();
  execSync("taskkill /f /im electron.exe", { stdio: "ignore" });
  console.log("Done. Electron killed.");
}
main().catch(e => { console.error("FAIL:", e.message); process.exit(1); });
