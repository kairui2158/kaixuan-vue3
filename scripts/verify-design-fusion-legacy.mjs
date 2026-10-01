import fs from "node:fs";
import path from "node:path";

const phase = process.argv.find((arg) => arg.startsWith("--phase="))?.slice(8) ?? "P0";
const phaseLevel = Number(phase.slice(1));
const root = process.cwd();

const whitelist = [];

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith("dist")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(vue|ts|css|mjs)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function parseCssBlocks(css) {
  const nodes = [];
  const stack = [];
  const bodies = [];
  let selector = "";
  let index = 0;
  while (index < css.length) {
    const char = css[index];
    if (char === "{") {
      const node = { selector: selector.trim(), body: "", children: [] };
      stack.push(node);
      bodies.push("");
      selector = "";
    } else if (char === "}") {
      const node = stack.pop();
      if (node) {
        node.body = bodies.pop() ?? "";
        (stack.at(-1)?.children ?? nodes).push(node);
      }
    } else if (stack.length === 0) {
      selector += char;
    } else {
      bodies[bodies.length - 1] += char;
    }
    index += 1;
  }
  return nodes;
}

function collectNodes(nodes, result = []) {
  for (const node of nodes) {
    result.push(node);
    collectNodes(node.children, result);
  }
  return result;
}

function relative(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function addFinding(findings, file, line, message, suggestion) {
  const rel = relative(file);
  const exempt = whitelist.some((item) => rel === item.file && phaseLevel < Number(item.removeAt.slice(1)) && new RegExp(item.pattern).test(message));
  if (exempt) return;
  findings.push({ file: rel, line, message, suggestion });
}

function lineOf(content, offset) {
  return content.slice(0, offset).split("\n").length;
}

const files = walk(path.join(root, "src")).concat(walk(path.join(root, "scripts")));
const findings = [];
const phaseRules = [];
const mainTokenNames = new Set(
  [...fs.readFileSync(path.join(root, "src/styles/tokens.css"), "utf8").matchAll(/(--[a-z0-9-]+)\s*:/g)]
    .map((match) => match[1])
);

if (phaseLevel >= 0) {
  phaseRules.push({
    name: "P0 token single source",
    run() {
      const tokenFile = path.join(root, "src/styles/tokens.css");
      const css = fs.readFileSync(tokenFile, "utf8");
      const nodes = collectNodes(parseCssBlocks(css));
      const prettyNodes = collectNodes(parseCssBlocks(css.replace(/\r\n/g, "\n")));
      if (process.env.DEBUG_DESIGN_SCAN) {
        console.error(nodes.map((node) => `${JSON.stringify(node.selector)} len=${node.body.length}`).join("\n"));
      }
      const requiredRoot = [
        "--border-hairline",
        "--hover-veil",
        "--surface-canvas",
        "--surface-chrome",
        "--overlay-level-1",
        "--overlay-blur",
        "--text-ink",
        "--text-mid",
        "--text-hollow",
      ];
      const rootNode = nodes.find((node) => node.selector.includes(":root"));
      for (const token of requiredRoot) {
        if (!rootNode?.body.includes(`${token}:`) && !prettyNodes.find((node) => node.selector.includes(":root"))?.body.includes(`${token}:`)) {
          findings.push({ file: "src/styles/tokens.css", line: 1, message: `missing :root token ${token}`, suggestion: "Define the token in the dark root palette." });
        }
      }
      const light = nodes.find((node) => node.selector.includes("body.light-theme")) ?? prettyNodes.find((node) => node.selector.includes("body.light-theme"));
      if (!light?.body.includes("--bg-primary: #ffffff") || !light?.body.includes("--surface-chrome: #f9f9f9") || !light?.body.includes("--text-ink: #0d0d0d")) {
        findings.push({ file: "src/styles/tokens.css", line: 1, message: "light theme is not the confirmed graphite palette", suggestion: "Use #ffffff / #f9f9f9 / #0d0d0d in the light theme." });
      }
      if (!light?.body.includes("--overlay-blur: none")) {
        findings.push({ file: "src/styles/tokens.css", line: 1, message: "light overlay blur is not disabled", suggestion: "Set --overlay-blur: none." });
      }
      if (!css.includes("--text-display: 24px")) {
        findings.push({ file: "src/styles/tokens.css", line: 1, message: "--text-display is not 24px", suggestion: "Keep the display ceiling at 24px." });
      }
      for (const node of nodes) {
        const seen = new Set();
        const regex = /--[a-z0-9-]+\s*:/gi;
        let match;
        while ((match = regex.exec(node.body))) {
          const token = match[0].slice(0, -1).trim();
          if (seen.has(token)) addFinding(findings, tokenFile, lineOf(css, match.index), `duplicate token ${token} in ${node.selector || "root"}`, "Keep one declaration per selector block.");
          seen.add(token);
        }
      }
      const zTokens = [...css.matchAll(/(--z-[a-z0-9-]+)\s*:/gi)].map((match) => match[1]);
      const consumerFiles = files.filter((item) => relative(item) !== "src/styles/tokens.css");
      const consumerCss = consumerFiles.map((file) => fs.readFileSync(file, "utf8"));
      for (const token of new Set(zTokens)) {
        if (!consumerCss.some((content) => content.includes(token))) {
          const match = [...css.matchAll(new RegExp(`${token}\\s*:`, "gi"))][0];
          findings.push({ file: "src/styles/tokens.css", line: lineOf(css, match?.index ?? 0), message: `unconsumed z token ${token}`, suggestion: "Delete the token or add a consumer." });
        }
      }
      const legacyTokens = [
        "--radius-btn",
        "--space-xxs",
        "--space-xs",
        "--space-sm",
        "--space-md",
        "--space-lg",
        "--space-xl",
        "--space-s",
        "--space-sm-plus",
        "--space-md-plus",
        "--space-2xl",
      ];
      for (const file of files.filter((item) => relative(item) !== "scripts/verify-design-fusion-legacy.mjs" && item.endsWith(".vue"))) {
        const content = fs.readFileSync(file, "utf8");
        for (const token of legacyTokens) {
          const regex = new RegExp(`${token}\\b`, "g");
          let match;
          while ((match = regex.exec(content))) addFinding(findings, file, lineOf(content, match.index), `legacy token ${token}`, "Use the numeric spacing token or --btn-radius.");
        }
        const emptyShadow = /var\(--shadow-\)/g;
        let match;
        while ((match = emptyShadow.exec(content))) addFinding(findings, file, lineOf(content, match.index), "empty --shadow- reference", "Use a valid shadow token.");
      }
      for (const file of files.filter((item) => relative(item) !== "scripts/verify-design-fusion-legacy.mjs" && /\.(vue|css)$/.test(item))) {
        const content = fs.readFileSync(file, "utf8");
        const invalidValue = /\d+var\(/g;
        let match;
        while ((match = invalidValue.exec(content))) {
          addFinding(findings, file, lineOf(content, match.index), `invalid CSS value ${match[0]}`, "A unitless number cannot directly prefix var(); use a spacing token or calc().");
        }
      }
    },
  });
}

if (phaseLevel >= 1) {
  phaseRules.push({
    name: "P1 feedback single source",
    run() {
      for (const file of files.filter((item) => relative(item) !== "scripts/verify-design-fusion-legacy.mjs" && item.endsWith(".vue"))) {
        const content = fs.readFileSync(file, "utf8");
        const patterns = [
          [/(?<![\w-])notyf(?![\w-])/g, "legacy notyf implementation"],
          [/(?<![\w-])dom-toast-container(?![\w-])/g, "legacy DOM toast implementation"],
          [/(?<![\w-])\.toast(?![\w-])/g, "legacy .toast implementation"],
        ];
        for (const [regex, message] of patterns) {
          let match;
          while ((match = regex.exec(content))) addFinding(findings, file, lineOf(content, match.index), message, "Use the unified toast service classes.");
        }
      }
    },
  });

  phaseRules.push({
    name: "P1 interaction single source",
    run() {
      for (const file of files.filter((item) => relative(item) !== "scripts/verify-design-fusion-legacy.mjs")) {
        const content = fs.readFileSync(file, "utf8");
        const fallbackColor = /var\(--[a-z0-9-]+,\s*(?:#[0-9a-fA-F]{3,8}\b|rgba?\()/g;
        let match;
        while ((match = fallbackColor.exec(content))) addFinding(findings, file, lineOf(content, match.index), "token fallback hardcodes a color", "Use the single token source.");

        const bareOutline = /(?<!:not\(:focus-visible\)\s*)outline:\s*none/g;
        while ((match = bareOutline.exec(content))) {
          const before = content.slice(Math.max(0, match.index - 40), match.index);
          if (!before.includes(":focus:not(:focus-visible)")) addFinding(findings, file, lineOf(content, match.index), "bare outline:none suppresses keyboard focus", "Only suppress the non-focus-visible state.");
        }

        const handwrittenIcon = /<svg(?:\s|>)/g;
        while ((match = handwrittenIcon.exec(content))) {
          if (relative(file) !== "src/components/common/AppIcon.vue") addFinding(findings, file, lineOf(content, match.index), "handwritten SVG bypasses AppIcon", "Add the icon to AppIcon and use the component.");
        }

        const textClose = />(?:\s*(?:×|&times;|x)\s*)</g;
        while ((match = textClose.exec(content))) addFinding(findings, file, lineOf(content, match.index), "text close symbol bypasses AppIcon", "Use <AppIcon name=\"x\" /> with aria-label.");

        const legacyTooltip = /<(?:button|a|input|select|textarea|div|span|p)\b[^>]*\s:?(?:title)=["'][^"']+["']/g;
        while ((match = legacyTooltip.exec(content))) {
          const tag = match[0].slice(1);
          const element = tag.match(/^([a-z]+)/)?.[1] ?? "element";
          const isTextControl = /^(?:a|input|select|textarea)$/.test(element);
          const hasDataTooltip = /(?:^|\s)(?::data-tooltip|data-tooltip)=/.test(tag);
          const hasAriaLabel = /(?:^|\s)aria-label=/.test(tag);
          if (!hasAriaLabel && (isTextControl || !hasDataTooltip)) {
            addFinding(
              findings,
              file,
              lineOf(content, match.index),
              `raw title tooltip on <${element}> bypasses data-tooltip`,
              "Use data-tooltip for pointer tooltips; use aria-label for icon-only and text controls."
            );
          }
        }

        const inlineStyle = /(?:^|\s)style="([^"]+)"/g;
        while ((match = inlineStyle.exec(content))) {
          const value = match[1];
          if (/(?:^|;)\s*(?:color|background(?:-color)?|font-size|line-height|border-radius|z-index|transition|animation)\s*:/i.test(value) || /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(value)) {
            addFinding(findings, file, lineOf(content, match.index), `template inline style bypasses CSS tokens: ${value}`, "Move the declaration to a style block and consume design tokens.");
          }
        }

        const tokenFallback = /var\((--[a-z0-9-]+)\s*,/g;
        while ((match = tokenFallback.exec(content))) {
          if (mainTokenNames.has(match[1])) {
            addFinding(findings, file, lineOf(content, match.index), `token fallback duplicates the design source ${match[1]}`, "Use var(token) without a fallback for tokens defined in tokens.css.");
          }
        }
      }
    },
  });
}

if (phaseLevel >= 3) {
  phaseRules.push({
    name: "P3 graph and diagnostics tokens",
    run() {
      const diagnosticFiles = new Set([
        "src/components/common/MemoryPanel.vue",
        "src/components/common/RunTracePanel.vue",
        "src/components/common/RunTraceDiffPanel.vue",
        "src/components/common/TextDiffView.vue",
        "src/components/common/RealSkillDiagnosticsPanel.vue",
        "src/components/settings/DiagLogPanel.vue",
      ]);
      for (const file of files.filter((item) => item.includes(`${path.sep}memory`) || diagnosticFiles.has(relative(item)))) {
        const content = fs.readFileSync(file, "utf8");
        const regex = /#[0-9a-fA-F]{3,8}\b|rgba?\(/g;
        let match;
        while ((match = regex.exec(content))) addFinding(findings, file, lineOf(content, match.index), "hardcoded color in migrated graph/diagnostic scope", "Move the value to a theme token.");
      }
    },
  });
}

if (phaseLevel >= 4) {
  phaseRules.push({
    name: "P4 modal focus contract",
    run() {
      for (const file of files.filter((item) => item.endsWith(".vue"))) {
        const content = fs.readFileSync(file, "utf8");
        // Every queued modal must expose a focus root keyed by the same id.
        // getZIndex is rendered on each modal root, so it is the stable literal
        // anchor for both static open() calls and dynamic id maps.
        const queueId = /modalQueue\.getZIndex\(\s*["']([^"']+)["']\s*\)/g;
        let match;
        while ((match = queueId.exec(content))) {
          const literal = `id="${match[1]}"`;
          const dataId = `data-modal-id="${match[1]}"`;
          if (!content.includes(literal) && !content.includes(dataId)) {
            addFinding(findings, file, lineOf(content, match.index), `modal ${match[1]} has no focus root contract`, "Add id or data-modal-id equal to the queue id used by modalQueue.");
          }
        }
      }
    },
  });
}

if (phaseLevel >= 4) {
  phaseRules.push({
    name: "P4 overlay and layer tokens",
    run() {
      for (const file of files.filter((item) => relative(item) !== "src/styles/modal.css")) {
        const content = fs.readFileSync(file, "utf8");
        const legacyOverlays = /\.(pl|ow|pm|dash|mem|rt|naming)-overlay\b/g;
        let match;
        while ((match = legacyOverlays.exec(content))) addFinding(findings, file, lineOf(content, match.index), `legacy overlay class ${match[0]}`, "Use the modal overlay base class.");
        const zIndex = /z-index:\s*(?!var\()(\d+)/g;
        while ((match = zIndex.exec(content))) addFinding(findings, file, lineOf(content, match.index), `raw z-index ${match[1]}`, "Use a layer token.");
        const customOverlay = /(?<![\w-])\.([a-z][a-z0-9]*(?:-[a-z0-9]+)*-overlay)\s*\{([^}]*)\}/gis;
        while ((match = customOverlay.exec(content))) {
          if (/position:\s*fixed/i.test(match[2]) && /inset:\s*0/i.test(match[2]) && /background(?:-color)?\s*:/i.test(match[2])) {
            addFinding(findings, file, lineOf(content, match.index), `custom fullscreen overlay ${match[1]}`, "Use .modal-overlay (plus .modal-nested for nested dialogs).");
          }
        }
        const legacyOverlayBackground = /background(?:-color)?:\s*var\((--bg-overlay(?:-strong|-soft)?)\)/g;
        while ((match = legacyOverlayBackground.exec(content))) addFinding(findings, file, lineOf(content, match.index), `legacy overlay background token ${match[1]}`, "Use var(--overlay-level-1) for full-screen veils.");
        const modalFallback = /var\(--overlay-level-1,\s*var\(--bg-overlay[^)]*\)\)/g;
        while ((match = modalFallback.exec(content))) addFinding(findings, file, lineOf(content, match.index), "overlay token fallback chain", "Use the single source var(--overlay-level-1).");
      }
    },
  });
}

if (phaseLevel >= 5) {
  phaseRules.push({
    name: "P5 css selector and declaration hygiene",
    run() {
      const cssFiles = files.filter((file) => file.endsWith(".css"));
      for (const file of cssFiles) {
        const content = fs.readFileSync(file, "utf8");
        const nodes = collectNodes(parseCssBlocks(content));
        const seen = new Map();
        for (const node of collectNodes(nodes)) {
          if (!node.selector || node.selector.startsWith("@")) continue;
          const selector = node.selector.replace(/\s+/g, " ").trim();
          if (seen.has(selector)) {
            const previous = seen.get(selector);
            addFinding(findings, file, previous, `duplicate selector ${selector}`, "Merge the declarations and keep one rule per selector.");
          } else {
            seen.set(selector, lineOf(content, content.indexOf(node.selector)));
          }
        }
        // A bare word after a class is valid only for element selectors such as
        // .modal-header h3. Class-like words such as btn-ghost are the typo
        // pattern: .btn-sm btn-ghost.
        const htmlTags = new Set([
          "a", "abbr", "address", "area", "article", "aside", "audio", "b", "base", "bdi", "bdo", "blockquote", "body", "br", "button", "canvas", "caption", "cite", "code", "col", "colgroup", "data", "datalist", "dd", "del", "details", "dfn", "dialog", "div", "dl", "dt", "em", "embed", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hgroup", "hr", "html", "i", "iframe", "img", "input", "ins", "kbd", "label", "legend", "li", "link", "main", "map", "mark", "menu", "meta", "meter", "nav", "noscript", "object", "ol", "optgroup", "option", "output", "p", "param", "picture", "pre", "progress", "q", "rp", "rt", "ruby", "s", "samp", "script", "search", "section", "select", "slot", "small", "source", "span", "strong", "style", "sub", "summary", "sup", "table", "tbody", "td", "template", "textarea", "tfoot", "th", "thead", "time", "title", "tr", "track", "u", "ul", "var", "video", "wbr"
        ]);
        const invalidSelector = /(^|[\s,}])\.([a-z][a-z0-9-]*(?:-[a-z0-9]+)*)\s+([a-z][a-z0-9-]*)\s*\{/g;
        let match;
        while ((match = invalidSelector.exec(content))) {
          if (!/^[.#[]/.test(match[3]) && !htmlTags.has(match[3])) {
            addFinding(findings, file, lineOf(content, match.index), `invalid compound selector ${match[0].trim()}`, "Use .class.class for an element that has both classes.");
          }
        }
      }
    },
  });
}

if (phaseLevel >= 5) {
  phaseRules.push({
    name: "P5 typography radius and duration tokens",
    run() {
      const contentTypographyFiles = new Set([
        "src/styles/ai-content.css",
        "src/components/settings/SkillSettings.vue",
      ]);
      const functionalAnimations = new Set(["deai-pulse", "flash-fade", "wh-spin"]);
      const scanTargets = files.filter((file) => file.endsWith(".css") || file.endsWith(".vue"));
      for (const file of scanTargets) {
        const rel = relative(file);
        if (rel === "scripts/verify-design-fusion-legacy.mjs") continue;
        const content = fs.readFileSync(file, "utf8");
        const cssChunks = file.endsWith(".vue")
          ? [...content.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((match) => match[1])
          : [content];
        for (const css of cssChunks) {
          const offsetBase = content.indexOf(css);
          const property = /(?:^|[;{\n])\s*(font-size|border-radius|transition|animation|transition-duration|animation-duration)\s*:\s*([^;}]+)/gm;
          let match;
          while ((match = property.exec(css))) {
            const name = match[1];
            const value = match[2].trim();
            const line = lineOf(content, offsetBase + match.index);
            if (name === "font-size") {
              if (/^var\(|^inherit$|^0$/.test(value)) continue;
              if (contentTypographyFiles.has(rel) && /em$/.test(value)) continue;
              addFinding(findings, file, line, `raw font-size ${value}`, "Use the font-size token scale.");
            } else if (name === "border-radius") {
              if (/^var\(|^50%$|^9999px$|^inherit$/.test(value)) continue;
              if (/^(?:0(?:px)?(?:\s*!important)?\s*)+$/.test(value)) continue;
              if (value.split(/\s+/).every((part) => /^var\(/.test(part) || part === "0")) continue;
              addFinding(findings, file, line, `raw border-radius ${value}`, "Use the radius token scale.");
            } else {
              if (name.startsWith("animation") && [...functionalAnimations].some((animation) => value.includes(animation))) continue;
              if (value.includes("0.01ms")) continue;
              const durations = [...value.matchAll(/\b\d+(?:\.\d+)?(?:ms|s)\b/g)];
              if (durations.length > 0 && !/var\(/.test(value)) {
                addFinding(findings, file, line, `raw ${name} duration ${value}`, "Use duration/easing tokens.");
              }
            }
          }
        }
      }
    },
  });

  phaseRules.push({
    name: "P5 interactive density single source",
    run() {
      const decorativeHeightSelectors = new Set([
        "src/App.vue:.resizer-v::before",
        "src/components/naming/AiNamingModal.vue:.naming-icon-btn",
        "src/components/naming/AiNamingModal.vue:.naming-sigil",
        "src/components/naming/AiNamingModal.vue:.naming-step-btn",
        "src/components/naming/AiNamingModal.vue:.naming-stepper",
        "src/components/pipeline/PipelineFlow.vue:.pf-node-num",
        "src/components/pipeline/PipelinePanel.vue:.pl-object-select-index",
        "src/components/pipeline/PipelinePanel.vue:.pl-step-num",
        "src/components/settings/DiagLogPanel.vue:.btn-close",
        "src/components/sidebar/SidebarNav.vue:.sidebar-btn",
        "src/styles/modal.css:.modal-close",
      ]);
      for (const file of files.filter((item) => item.endsWith(".vue"))) {
        const content = fs.readFileSync(file, "utf8");
        const legacyHeightTokens = /var\(--(?:input|btn-(?:xs|sm|md|lg))-height\)/g;
        let match;
        while ((match = legacyHeightTokens.exec(content))) addFinding(findings, file, lineOf(content, match.index), `legacy height token ${match[0]}`, "Use var(--density-form-height) or a density button token.");

        const styleStart = content.indexOf("<style");
        if (styleStart === -1) continue;
        const styleContent = content.slice(styleStart);
        const selectorRegex = /([^{}]+)\{([^{}]*)\}/g;
        while ((match = selectorRegex.exec(styleContent))) {
          const selector = match[1].replace(/<style[^>]*>/, "").trim();
          const body = match[2];
          const heightRegex = /(?:^|;)\s*(height|min-height)\s*:\s*(2[4-9]|3[0-8])px\s*(?:;|$)/gm;
          let heightMatch;
          while ((heightMatch = heightRegex.exec(body))) {
            const key = `${relative(file)}:${selector}`;
            if (decorativeHeightSelectors.has(key)) continue;
            if (/input|select|textarea|option|search|field|btn|button|close|toggle|tab|stepper/i.test(selector)) {
              addFinding(findings, file, lineOf(content, styleStart + match.index + match[1].length + 1 + heightMatch.index), `interactive control hardcodes ${heightMatch[2]}px ${heightMatch[1]}`, "Use the density token for this control family.");
            }
          }
        }
      }
    },
  });

  phaseRules.push({
    name: "P5 animation single source",
    run() {
      const cssFiles = files.filter((file) => file.endsWith(".css") || file.endsWith(".vue"));
      const allCss = cssFiles.map((file) => ({ file, content: fs.readFileSync(file, "utf8") }));
      const definitions = new Map();
      const references = new Set();
      for (const { file, content } of allCss) {
        const definition = /@keyframes\s+([a-zA-Z0-9_-]+)/g;
        let match;
        while ((match = definition.exec(content))) {
          definitions.set(match[1], [...(definitions.get(match[1]) ?? []), { file, line: lineOf(content, match.index) }]);
        }
        const use = /animation(?:-name)?\s*:\s*[^;]*?([a-zA-Z0-9_-]+)/g;
        while ((match = use.exec(content))) references.add(match[1]);
        const willChange = /will-change:\s*transform/g;
        while ((match = willChange.exec(content))) addFinding(findings, file, lineOf(content, match.index), "resident will-change: transform", "Apply will-change only during animation.");
        const blur = /(?<!-webkit-)backdrop-filter\s*:\s*([^;\n]+)/g;
        while ((match = blur.exec(content))) {
          if (!match[1].trim().startsWith("var(")) {
            addFinding(findings, file, lineOf(content, match.index), "untokenized backdrop-filter", "Use var(--overlay-blur).");
          }
        }
      }
      for (const [name, sites] of definitions) {
        if (sites.length > 1) for (const site of sites) addFinding(findings, site.file, site.line, `duplicate keyframes ${name}`, "Keep one definition per animation.");
        if (!references.has(name)) for (const site of sites) addFinding(findings, site.file, site.line, `unreferenced keyframes ${name}`, "Delete the animation or reference it.");
      }
    },
  });
}

if (phaseLevel >= 3) {
  phaseRules.push({
    name: "P3 responsive breakpoint single source",
    run() {
      const allowedMaxWidths = new Set([600, 760, 799, 1023, 1279]);
      const allowedMinWidths = new Set([800, 1024, 1280, 1600, 2560]);
      const cssFiles = files.filter((file) => file.endsWith(".css") || file.endsWith(".vue"));
      for (const file of cssFiles) {
        const content = fs.readFileSync(file, "utf8");
        const maxWidth = /@media\s*\(max-width:\s*(\d+)px\)/g;
        let match;
        while ((match = maxWidth.exec(content))) {
          if (!allowedMaxWidths.has(Number(match[1]))) {
            addFinding(findings, file, lineOf(content, match.index), `nonstandard max-width breakpoint ${match[1]}px`, "Use 600 / 760 / 799 / 1023 / 1279.");
          }
        }
        const minWidth = /@media\s*\(min-width:\s*(\d+)px\)(?!\s*and)/g;
        while ((match = minWidth.exec(content))) {
          if (!allowedMinWidths.has(Number(match[1]))) {
            addFinding(findings, file, lineOf(content, match.index), `nonstandard min-width breakpoint ${match[1]}px`, "Use 800 / 1024 / 1280 / 1600 / 2560.");
          }
        }
      }
    },
  });
}

for (const rule of phaseRules) rule.run();

console.log(`design fusion legacy scan | phase=${phase} | files=${files.length}`);
if (findings.length === 0) {
  console.log("PASS: 0 non-whitelisted legacy findings");
} else {
  for (const finding of findings) {
    console.log(`${finding.file}:${finding.line} | ${finding.message} | ${finding.suggestion}`);
  }
  console.log(`FAIL: ${findings.length} non-whitelisted legacy findings`);
}
process.exitCode = findings.length === 0 ? 0 : 1;
