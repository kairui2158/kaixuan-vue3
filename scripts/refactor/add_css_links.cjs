const fs = require("fs");
let html = fs.readFileSync("renderer.html", "utf8");
const oldLine = '<link rel="stylesheet" href="style.css">';
const newLines = oldLine + "\n" +
  '  <link rel="stylesheet" href="styles/tokens.css">\n' +
  '  <link rel="stylesheet" href="styles/components/buttons.css">\n' +
  '  <link rel="stylesheet" href="styles/components/modal-panel.css">\n' +
  '  <link rel="stylesheet" href="styles/components/form-editor.css">';
if (!html.includes(oldLine)) { console.log("ERROR: style.css line not found"); process.exit(1); }
if (html.includes("styles/tokens.css")) { console.log("SKIP: already has tokens.css"); process.exit(0); }
html = html.replace(oldLine, newLines);
fs.writeFileSync("renderer.html", html, "utf8");
console.log("OK: 4 CSS links added after style.css");
