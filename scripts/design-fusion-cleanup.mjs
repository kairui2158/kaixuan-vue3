import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const mode = process.argv[2];

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith("dist")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(vue|css)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function mainTokenNames() {
  const css = fs.readFileSync(path.join(root, "src/styles/tokens.css"), "utf8");
  return new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1]));
}

function matchingParen(content, start) {
  let depth = 0;
  for (let index = start; index < content.length; index += 1) {
    if (content[index] === "(") depth += 1;
    if (content[index] === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error(`unbalanced parentheses at offset ${start}`);
}

function stripFallback(content, tokens) {
  let output = "";
  let cursor = 0;
  while (cursor < content.length) {
    const start = content.indexOf("var(", cursor);
    if (start === -1) {
      output += content.slice(cursor);
      break;
    }
    const nameStart = start + 4;
    const cursorAfterName = (() => {
      for (let index = nameStart; index < content.length; index += 1) {
        if (content[index] === "," || content[index] === ")") return index;
      }
      throw new Error("unterminated var()");
    })();
    const name = content.slice(nameStart, cursorAfterName).trim();
    const close = matchingParen(content, start);
    if (tokens.has(name) && content[cursorAfterName] === ",") {
      output += `${content.slice(cursor, start)}var(${name})`;
    } else {
      output += content.slice(cursor, close + 1);
    }
    cursor = close + 1;
  }
  return output;
}

function migrateTooltips(content) {
  return content.replace(/<(button|div|span|p|a|input|select|textarea)\b[^>]*>/gis, (tag, element) => {
    const target = /^(?:a|input|select|textarea)$/i.test(element) ? ":aria-label" : ":data-tooltip";
    return tag.replace(/(\s):?title=(["'])(.*?)\2/gis, `$1${target}=$2$3$2`);
  });
}

if (mode !== "--fallbacks" && mode !== "--tooltips") {
  console.error("usage: node scripts/design-fusion-cleanup.mjs --fallbacks|--tooltips");
  process.exit(2);
}

const files = walk(path.join(root, "src"));
const tokens = mainTokenNames();
let changed = 0;
for (const file of files) {
  const before = fs.readFileSync(file, "utf8");
  const after = mode === "--fallbacks" ? stripFallback(before, tokens) : migrateTooltips(before);
  if (after !== before) {
    fs.writeFileSync(file, after);
    console.log(path.relative(root, file));
    changed += 1;
  }
}
console.log(`changed=${changed}`);
