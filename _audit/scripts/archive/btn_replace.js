const fs = require("fs");
const path = require("path");
const rootDir = "src";
const replacements = [
  ["btn-confirm", "btn-primary"],
  ["btn-cancel", "btn-secondary"],
  ["btn-stop", "btn-danger"],
  ["btn-back-sm", "btn-sm btn-ghost"],
];
function walk(dir) {
  const files = fs.readdirSync(dir);
  let total = 0;
  for (const f of files) {
    const fp = path.join(dir, f);
    const st = fs.statSync(fp);
    if (st.isDirectory()) {
      total += walk(fp);
    } else if (f.endsWith(".vue") || f.endsWith(".css") || f.endsWith(".js")) {
      let c = fs.readFileSync(fp, "utf8");
      let n = 0;
      for (const [old, replacement] of replacements) {
        const escaped = old.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(escaped, "g");
        const m = c.match(regex);
        if (m) {
          c = c.replace(regex, replacement);
          n += m.length;
        }
      }
      if (n > 0) {
        fs.writeFileSync(fp, c);
        console.log("  " + path.relative(rootDir, fp) + ": " + n);
        total += n;
      }
    }
  }
  return total;
}
const t = walk(rootDir);
console.log("Total button class replacements: " + t);
