import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const rel = (file) => path.relative(root, file).replaceAll("\\", "/");

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith("dist")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(vue|css|mjs|ts)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const files = walk(path.join(root, "src"));
const contents = files.map((file) => ({ file, content: fs.readFileSync(file, "utf8") }));
const tokenFile = contents.find(({ file }) => rel(file) === "src/styles/tokens.css");
if (!tokenFile) throw new Error("tokens.css not found");

const definitions = new Map();
const definition = /--([a-z0-9-]+)\s*:/g;
let match;
while ((match = definition.exec(tokenFile.content))) {
  const token = `--${match[1]}`;
  if (!definitions.has(token)) {
    definitions.set(token, tokenFile.content.slice(0, match.index).split("\n").length);
  }
}

const references = new Map();
const documentedBaseTokens = new Map([
  ["--text-display", "Graphite Ink reserves this as the 24px display ceiling."],
]);
const dynamicTokens = [
  "--g6-node-fill",
  "--g6-node-stroke",
  "--g6-node-text",
  "--g6-edge-stroke",
  "--g6-edge-label",
  "--g6-minimap-bg",
  "--g6-toolbar-bg",
  "--g6-tooltip-bg",
  "--g6-tooltip-text",
  "--g6-legend-bg",
  "--g6-selected",
  "--g6-hover",
  "--g6-core",
  "--g6-active",
  "--g6-normal",
  "--g6-isolated",
  "--memory-node-bg",
  "--memory-node-selected-bg",
  "--memory-node-border",
  "--memory-node-text",
  "--shiki-dark",
  "--shiki-light",
];
for (const token of dynamicTokens) {
  const sites = contents
    .filter(({ content }) => content.includes(token))
    .map(({ file, content }) => {
      const index = content.indexOf(token);
      return `${rel(file)}:${content.slice(0, index).split("\n").length}`;
    });
  if (sites.length > 0) references.set(token, sites);
}
for (const { file, content } of contents) {
  const reference = /var\((--([a-z0-9-]+))(?:\s*,[^()]*(?:\([^)]*\)[^()]*)*)?\)/g;
  while ((match = reference.exec(content))) {
    const token = match[1];
    if (!references.has(token)) references.set(token, []);
    references.get(token).push(`${rel(file)}:${content.slice(0, match.index).split("\n").length}`);
  }
}

const dead = [...definitions].filter(([token]) => !references.has(token) && !documentedBaseTokens.has(token));
const undefinedReferences = [...references].filter(([token]) => !definitions.has(token));
const externalRuntimeTokens = new Set(["--shiki-dark", "--shiki-light"]);
const actionableUndefinedReferences = undefinedReferences.filter(([token]) => !externalRuntimeTokens.has(token));

console.log(`tokens defined=${definitions.size} referenced=${references.size}`);
console.log(`\nDEAD (${dead.length})`);
for (const [token, line] of dead) console.log(`${token} tokens.css:${line}`);
console.log(`\nUNDEFINED (${actionableUndefinedReferences.length})`);
for (const [token, sites] of actionableUndefinedReferences) {
  console.log(`${token}`);
  for (const site of sites.slice(0, 8)) console.log(`  ${site}`);
}

console.log("\nRAW FONT-SIZE");
for (const { file, content } of contents.filter(({ file }) => !rel(file).endsWith("src/styles/tokens.css"))) {
  const property = /(?:^|[;{\n])\s*font-size\s*:\s*([^;}]+)/g;
  while ((match = property.exec(content))) {
    const value = match[1].trim();
    if (/^var\(|^inherit$|^0$/.test(value)) continue;
    console.log(`${rel(file)}:${content.slice(0, match.index).split("\n").length} ${value}`);
  }
}

console.log("\nRAW FONT-FAMILY");
for (const { file, content } of contents.filter(({ file }) => !rel(file).endsWith("src/styles/tokens.css") && !rel(file).endsWith("src/styles/fonts.css"))) {
  const property = /(?:^|[;{\n])\s*font-family\s*:\s*([^;}]+)/g;
  while ((match = property.exec(content))) {
    const value = match[1].trim();
    if (/^var\(|^inherit$/.test(value)) continue;
    console.log(`${rel(file)}:${content.slice(0, match.index).split("\n").length} ${value}`);
  }
}

console.log("\nRAW RADIUS");
for (const { file, content } of contents.filter(({ file }) => !rel(file).endsWith("src/styles/tokens.css"))) {
  const property = /(?:^|[;{\n])\s*border-radius\s*:\s*([^;}]+)/g;
  while ((match = property.exec(content))) {
    const value = match[1].trim();
    if (/^var\(|^50%$|^9999px$/.test(value)) continue;
    if (/^(?:0(?:px)?\s*)+$/.test(value)) continue;
    console.log(`${rel(file)}:${content.slice(0, match.index).split("\n").length} ${value}`);
  }
}

console.log("\nRAW DURATION");
for (const { file, content } of contents.filter(({ file }) => !rel(file).endsWith("src/styles/tokens.css"))) {
  const property = /(?:^|[;{\n])\s*(transition|animation|transition-duration|animation-duration)\s*:\s*([^;}]+)/g;
  while ((match = property.exec(content))) {
    const value = match[2];
    if (/var\(/.test(value)) continue;
    const durations = [...value.matchAll(/\b(\d+(?:\.\d+)?)(ms|s)\b/g)];
    if (durations.length === 0) continue;
    console.log(`${rel(file)}:${content.slice(0, match.index).split("\n").length} ${match[1]}: ${value.trim()}`);
  }
}
