const fs = require("fs");
const path = require("path");

// Collect all CSS class names from JS files
const jsFiles = ["panels.js", "renderer_v2.js", "main.js"].filter(f => fs.existsSync(f));
const allClasses = new Set();

for (const jsFile of jsFiles) {
  const content = fs.readFileSync(jsFile, "utf8");
  // Match class="xxx" and class='xxx' patterns
  const matches = content.matchAll(/class=["']([^"']+)["']/g);
  for (const m of matches) {
    const classes = m[1].split(/\s+/);
    for (const c of classes) {
      if (c.trim() && !c.includes("$") && !c.includes("{") && !c.includes("}")) {
        allClasses.add(c.trim());
      }
    }
  }
  // Also match className = "xxx" patterns
  const classNameMatches = content.matchAll(/className\s*=\s*["']([^"']+)["']/g);
  for (const m of classNameMatches) {
    const classes = m[1].split(/\s+/);
    for (const c of classes) {
      if (c.trim()) allClasses.add(c.trim());
    }
  }
}

// Collect all CSS selectors from all CSS files
const cssFiles = fs.readdirSync(".").filter(f => f.endsWith(".css"));
const styledClasses = new Set();

for (const cssFile of cssFiles) {
  const content = fs.readFileSync(cssFile, "utf8");
  // Match .classname patterns in selectors
  const matches = content.matchAll(/\.([a-zA-Z_][\w-]*)/g);
  for (const m of matches) {
    styledClasses.add(m[1]);
  }
}

// Find classes used in JS but not defined in any CSS
const unstyled = [];
for (const cls of allClasses) {
  if (!styledClasses.has(cls)) {
    unstyled.push(cls);
  }
}

// Filter out utility classes that don't need styling
const skipPatterns = ["active", "visible", "hidden", "open", "collapsed", "expanded",
  "selected", "disabled", "loading", "error", "success", "warning", "info",
  "fade", "show", "in", "out", "left", "right", "top", "bottom", "center",
  "flex", "block", "inline", "none", "full", "auto", "lg", "sm", "xs", "md", "xl"];

const filtered = unstyled.filter(c => !skipPatterns.includes(c) && c.length > 2);

console.log("=== CSS Class Gap Analysis ===");
console.log("Total classes in JS: " + allClasses.size);
console.log("Total classes in CSS: " + styledClasses.size);
console.log("Unstyled classes: " + filtered.length);
console.log("\nUnstyled classes (potential gaps):");
for (const c of filtered.sort()) {
  console.log("  ." + c);
}
