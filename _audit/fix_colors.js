const fs = require("fs");
const path = require("path");

const compDir = "D:/codex/novel-workshop-vue3/src/components";

// Replacement map: hardcoded color -> CSS var
const colorMap = {
  // Standalone hex colors (not inside var())
  "#fff": "var(--text-on-accent)",
  "#ffffff": "var(--text-on-accent)",
  "#4CAF50": "var(--success)",
  "#e74c3c": "var(--danger)",
  "#c0392b": "var(--danger-hover)",
  "#e87d3d": "var(--warning)",
  "#fff3e0": "var(--warning-dim)",
  "#888": "var(--text-muted)",
  "#2a2a30": "var(--border-color)",
  "#7c8cf8": "var(--accent)",
  "#a0a0a8": "var(--text-secondary)",
  "#e4e4e7": "var(--text-primary)",
  "#e0556a": "var(--danger)",
  "#161619": "var(--bg-secondary)"
};

// Fallback removal pattern: var(--xxx, #yyy) -> var(--xxx)
const fallbackRegex = /var\((--[a-z-]+),\s*#[0-9a-fA-F]{3,8}\)/g;

function processStyleBlock(content) {
  // Split by <style tags to only process style blocks
  const parts = content.split(/(<style[^>]*>[\s\S]*?<\/style>)/g);
  let changed = false;
  
  for (let i = 0; i < parts.length; i++) {
    if (parts[i] && parts[i].startsWith("<style")) {
      let styleContent = parts[i];
      let original = styleContent;
      
      // Step 1: Remove fallback values from var(--xxx, #yyy)
      styleContent = styleContent.replace(fallbackRegex, "var($1)");
      
      // Step 2: Replace standalone hex colors (not inside var())
      // We need to be careful not to replace colors inside var() or data:image
      for (const [hex, replacement] of Object.entries(colorMap)) {
        // Match hex color not preceded by var( and not inside data:image
        const hexRegex = new RegExp("(?<!var\([--a-z]*\s*)" + hex.replace(/#/g, "\\#") + "(?![0-9a-fA-F])", "gi");
        styleContent = styleContent.replace(hexRegex, replacement);
      }
      
      // Step 3: Replace any remaining var(--xxx, #yyy) that were created by step 2
      styleContent = styleContent.replace(fallbackRegex, "var($1)");
      
      if (styleContent !== original) {
        parts[i] = styleContent;
        changed = true;
      }
    }
  }
  
  if (changed) {
    return { content: parts.join(""), changed: true };
  }
  return { content: content, changed: false };
}

function walkDir(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else if (entry.name.endsWith(".vue")) {
      results.push(fullPath);
    }
  }
  return results;
}

const files = walkDir(compDir);
let totalChanged = 0;
let totalReplacements = 0;

for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  const { content: newContent, changed } = processStyleBlock(content);
  if (changed) {
    // Count replacements
    const beforeMatches = (content.match(/#[0-9a-fA-F]{3,8}/g) || []).length;
    const afterMatches = (newContent.match(/#[0-9a-fA-F]{3,8}/g) || []).length;
    const replacements = beforeMatches - afterMatches;
    totalReplacements += replacements;
    fs.writeFileSync(file, newContent, "utf8");
    console.log(`[OK] ${path.basename(file)}: ${replacements} colors replaced`);
    totalChanged++;
  }
}

console.log(`\n=== DONE ===`);
console.log(`Files modified: ${totalChanged}`);
console.log(`Total color replacements: ${totalReplacements}`);
