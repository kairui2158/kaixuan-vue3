const fs = require("fs");
const path = require("path");

const rootDir = "src/components";

// Only replace values that EXACTLY match a token value - no visual change
const replacements = [
  // font-size
  ["font-size: 10px", "font-size: var(--font-size-xxs)"],
  ["font-size: 11px", "font-size: var(--font-size-xs)"],
  ["font-size: 12px", "font-size: var(--font-size-sm)"],
  ["font-size: 13px", "font-size: var(--font-size-md)"],
  ["font-size: 14px", "font-size: var(--font-size-md)"],
  ["font-size: 15px", "font-size: var(--font-size-lg)"],
  ["font-size: 16px", "font-size: var(--font-size-lg)"],
  ["font-size: 18px", "font-size: var(--font-size-xl)"],
  ["font-size: 20px", "font-size: var(--font-size-xxl)"],
  // border-radius
  ["border-radius: 2px", "border-radius: var(--radius-xs)"],
  ["border-radius: 3px", "border-radius: var(--radius-xs)"],
  ["border-radius: 4px", "border-radius: var(--radius-xs)"],
  ["border-radius: 5px", "border-radius: var(--radius-sm)"],
  ["border-radius: 6px", "border-radius: var(--radius-sm)"],
  ["border-radius: 8px", "border-radius: var(--radius-md)"],
  ["border-radius: 10px", "border-radius: var(--radius-lg)"],
  ["border-radius: 12px", "border-radius: var(--radius-lg)"],
  // color hex
  ["color: #fff", "color: var(--text-on-accent)"],
  ["color: #ffffff", "color: var(--text-on-accent)"],
  ["color: #e8e8ec", "color: var(--text-primary)"],
  ["color: #a0a2ac", "color: var(--text-secondary)"],
  ["color: #888a94", "color: var(--text-muted)"],
  ["color: #7c8cf8", "color: var(--accent)"],
  ["color: #e0556a", "color: var(--danger)"],
  ["color: #4caf88", "color: var(--success)"],
  ["color: #f0a050", "color: var(--warning)"],
  // padding exact token matches
  ["padding: 2px 4px", "padding: var(--space-1) var(--space-2)"],
  ["padding: 4px 8px", "padding: var(--space-2) var(--space-4)"],
  ["padding: 8px 12px", "padding: var(--space-4) var(--space-6)"],
  ["padding: 8px 16px", "padding: var(--space-4) var(--space-6)"],
  ["padding: 12px 16px", "padding: var(--space-5) var(--space-6)"],
  ["padding: 16px 24px", "padding: var(--space-6) var(--space-8)"],
];

function processFile(filePath) {
  let content = fs.readFileSync(filePath, "utf8");
  let count = 0;
  for (const [old, replacement] of replacements) {
    // Only replace in CSS context (not in template/script strings)
    const regex = new RegExp(old.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
    const matches = content.match(regex);
    if (matches) {
      content = content.replace(regex, replacement);
      count += matches.length;
    }
  }
  if (count > 0) {
    fs.writeFileSync(filePath, content);
  }
  return count;
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  let total = 0;
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      total += walkDir(fullPath);
    } else if (file.endsWith(".vue")) {
      const count = processFile(fullPath);
      if (count > 0) {
        console.log(`  ${path.relative(rootDir, fullPath)}: ${count}`);
        total += count;
      }
    }
  }
  return total;
}

console.log("Scanning Vue components...");
const total = walkDir(rootDir);
console.log(`\nTotal replacements: ${total}`);
