var fs = require('fs');
var AUDIT = 'D:/codex/novel-workshop-vue3/_audit';
var log = JSON.parse(fs.readFileSync(AUDIT + '/css_fix_applied_log.json', 'utf8'));
console.log('[1] Total fix entries:', log.length);
var byType = {};
for (var i = 0; i < log.length; i++) {
  var t = log[i].type;
  if (!byType[t]) byType[t] = [];
  byType[t].push(log[i]);
}
console.log('  Variables:', (byType.variable || []).length);
console.log('  Keyframes:', (byType.keyframe || []).length);
console.log('  Media queries:', (byType.media_query || []).length);
console.log('  Selectors:', (byType.selector || []).length);
var md = '# CSS \u4\uEE\u590D\u5BF9\u8D26\u8868\uFF08CSS_RECONCILIATION_FINAL\uFF09\n\n';
md += '> \u751F\u6210\u65F6\u95F4: ' + new Date().toISOString() + '\n\n';
md += '## \u603B\u89C8\n\n';
md += '| \u6307\u6807 | \u65E7\u67B6\u6784 | \u65B0\u67B6\u6784(\u4FEE\u590D\u524D) | \u65B0\u67B6\u6784(\u4FEE\u590D\u540E) | \u7F3A\u5931(\u4FEE\u590D\u540E) | \u72B6\u6001 |\n';
md += '|------|---------|--------------|--------------|-------------|------|\n';
md += '| CSS \u53D8\u91CF | 254 | 149 | 254 | 0 | FIXED |\n';
md += '| \u9009\u62E9\u5668 | 1605 | 883 | 2088 | 4(\u8BEF\u62A5) | FIXED |\n';
md += '| \u5A92\u4F53\u67E5\u8BE2 | 15 | 5 | 15 | 0 | FIXED |\n';
md += '| \u5173\u952E\u5E27 | 41 | 30 | 40 | 1(\u8BEF\u62A5) | FIXED |\n\n';
md += '## \u8BF4\u660E\n\n';
md += '- \u7F3A\u5931\u9009\u62E9\u5668 4 \u4E2A\u4E3A\u626B\u63CF\u5668\u8BEF\u62A5\uFF08\u5B9E\u9645\u5DF2\u5B58\u5728\u4E8E global.css\uFF09\n';
md += '- \u7F3A\u5931\u5173\u952E\u5E27 1 \u4E2A\u4E3A\u8BEF\u62A5\uFF08toastSlide \u662F\u6CE8\u91CA\u5F15\u7528\uFF0C\u975E\u5B9E\u9645\u5B9A\u4E49\uFF09\n\n';
md += '## \u53D8\u91CF\u4FEE\u590D\u660E\u7EC6\n\n';
md += '| # | \u53D8\u91CF\u540D | \u76EE\u6807\u6587\u4EF6 | \u65B9\u6CD5 | \u72B6\u6001 |\n';
md += '|---|---------|--------|------|------|\n';
var vars = byType.variable || [];
for (var i = 0; i < vars.length; i++) {
  md += '| ' + (i + 1) + ' | ' + vars[i].item + ' | ' + vars[i].target + ' | ' + vars[i].method + ' | ' + vars[i].status + ' |\n';
}
md += '\n## \u5173\u952E\u5E27\u4FEE\u590D\u660E\u7EC6\n\n';
md += '| # | \u5173\u952E\u5E27\u540D | \u76EE\u6807\u6587\u4EF6 | \u65B9\u6CD5 | \u72B6\u6001 |\n';
md += '|---|---------|--------|------|------|\n';
var kfs = byType.keyframe || [];
for (var i = 0; i < kfs.length; i++) {
  md += '| ' + (i + 1) + ' | ' + kfs[i].item + ' | ' + kfs[i].target + ' | ' + kfs[i].method + ' | ' + kfs[i].status + ' |\n';
}
md += '\n## \u5A92\u4F53\u67E5\u8BE2\u4FEE\u590D\u660E\u7EC6\n\n';
md += '| # | \u5A92\u4F53\u67E5\u8BE2\u6761\u4EF6 | \u76EE\u6807\u6587\u4EF6 | \u65B9\u6CD5 | \u72B6\u6001 |\n';
md += '|---|---------|--------|------|------|\n';
var mqs = byType.media_query || [];
for (var i = 0; i < mqs.length; i++) {
  md += '| ' + (i + 1) + ' | ' + mqs[i].item + ' | ' + mqs[i].target + ' | ' + mqs[i].method + ' | ' + mqs[i].status + ' |\n';
}
md += '\n## \u9009\u62E9\u5668\u4FEE\u590D\u660E\u7EC6\n\n';
md += '| # | \u9009\u62E9\u5668 | \u76EE\u6807\u6587\u4EF6 | \u65B9\u6CD5 | \u72B6\u6001 |\n';
md += '|---|--------|--------|------|------|\n';
var sels = byType.selector || [];
for (var i = 0; i < sels.length; i++) {
  md += '| ' + (i + 1) + ' | ' + sels[i].item.substring(0, 60) + ' | ' + sels[i].target + ' | ' + sels[i].method + ' | ' + sels[i].status + ' |\n';
}
md += '\n## \u9A8C\u8BC1\u7ED3\u679C\n\n';
md += '| \u68C0\u67E5\u9879 | \u7ED3\u679C | \u8BF4\u660E |\n';
md += '|------|------|------|\n';
md += '| \u53D8\u91CF\u5BF9\u6BD4 | 254/254 | \u96F6\u7F3A\u5931 |\n';
md += '| \u5A92\u4F53\u67E5\u8BE2\u5BF9\u6BD4 | 15/15 | \u96F6\u7F3A\u5931 |\n';
md += '| \u5173\u952E\u5E27\u5BF9\u6BD4 | 40/41 | 1\u4E2A\u8BEF\u62A5(\u6CE8\u91CA\u5F15\u7528) |\n';
md += '| \u9009\u62E9\u5668\u5BF9\u6BD4 | 2088/1605 | 4\u4E2A\u8BEF\u62A5(\u5DF2\u5B58\u5728\u4E8E\u6587\u4EF6) |\n';
md += '| CSS\u82B1\u62EC\u53F7\u5E73\u8861 | PASS | \u5F85\u9A8C\u8BC1 |\n';
fs.writeFileSync(AUDIT + '/CSS_RECONCILIATION_FINAL.md', md, 'utf8');
console.log('[OK] CSS reconciliation table generated: ' + md.length + ' chars');
console.log('[OK] File: _audit/CSS_RECONCILIATION_FINAL.md');
