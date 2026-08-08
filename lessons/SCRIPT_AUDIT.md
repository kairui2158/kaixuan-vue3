# 脚本问题审计报告

生成日期: 2026-07-25
项目: 小说工坊 (Novel Workshop)
开发周期: 2026-07-02 ~ 2026-07-25 (24天)

---

# 一、脚本泛滥现状

## 1.1 根目录临时脚本清单 (15个)

| 脚本名 | 行数 | 大小 | 最后修改 | 用途 | 分类 | 处置 |
|--------|------|------|----------|------|------|------|
| check_css.js | 33 | 1.1KB | 07-24 | CSS花括号平衡检查 | 有用-工具 | 保留 |
| find_rules.js | 56 | 2.2KB | 07-24 | 查找CSS规则位置 | 有用-工具 | 保留 |
| verify_all.js | 269 | 13.2KB | 07-24 | 全量验证(语法+CSS+面板+功能) | 有用-验证 | 保留 |
| verify_ui_v3.js | 302 | 16.7KB | 07-23 | UI验证v3 | 废弃-重复 | 应删 |
| verify_ui_fix5.js | 285 | 12.6KB | 07-23 | UI验证fix5 | 废弃-重复 | 应删 |
| verify_ui_all4.js | 154 | 9.6KB | 07-23 | UI验证all4 | 废弃-重复 | 应删 |
| verify_ui_all.js | 214 | 8.5KB | 07-23 | UI验证all | 废弃-重复 | 应删 |
| verify_ui_v2.js | 187 | 9.4KB | 07-23 | UI验证v2 | 废弃-重复 | 应删 |
| test_cdp_verify4.js | 77 | 5.0KB | 07-23 | CDP验证v4 | 废弃-重复 | 应删 |
| test_verify_ui.js | 79 | 3.5KB | 07-23 | UI验证 | 废弃-重复 | 应删 |
| cdp_interact.js | 112 | 5.1KB | 07-23 | CDP交互测试 | 废弃-重复 | 应删 |
| cdp_screenshot.js | 64 | 2.1KB | 07-23 | CDP截图(ws库) | 废弃-重复 | 应删 |
| cdp_shot.js | 19 | 0.9KB | 07-23 | CDP截图简版 | 废弃-重复 | 应删 |
| test_shot.js | 14 | 0.5KB | 07-23 | 截图测试 | 废弃-重复 | 应删 |
| test_shot2.js | 23 | 0.8KB | 07-23 | 截图测试2 | 废弃-重复 | 应删 |

**统计**: 15个脚本，共1688行，总计90KB
- 有用保留: 3个 (358行)
- 废弃应删: 12个 (1330行，占79%)

## 1.2 历史脚本(已删除的)

开发至今写过但已删除的临时脚本(从ERROR_LOG和git log推断):
- _cdp_check.js, _cdp_data.js, _cdp_inspect.js — CDP调试探针
- _gen_test.js, _gen2.js — 生成测试
- _sc_probe.js, _sc_probe2.js — SC面板探针
- _tmp_shot.js, _tmp_shot2.js — 临时截图
- scan_btns.js — 按钮扫描
- verify_sc_panel_v2.js, take_sc_screenshot.js — SC验证
- del_lines.js — CSS行删除工具(有用但已用完)
- real_click_v3.mjs — 真实鼠标点击验证(有用但已用完)
- pipeline_behavioral_test.js — 流水线行为测试
- validate_runner.js — 验证运行器
- e2e_p1fix.js — E2E测试
- fix_r42_css_font.cjs — 字体修复

保守估计: 开发24天写过50+个临时脚本，其中80%已删除，20%仍在根目录堆积。

---

# 二、脚本写错的典型问题

## 2.1 同一功能写5个版本不删旧版

### 问题
verify_ui系列: v2 → v3 → all → all4 → fix5，5个版本全部堆积在根目录。

### 根因
每次写新版本时复制旧脚本改个名字，旧的忘了删。违反规则23"不做叠加"。

### 教训
新版本必须直接覆盖旧文件名，不创建新文件名。或者统一叫verify_ui.js，每次重写内容。

## 2.2 CDP截图脚本写了4个版本

### 问题
cdp_screenshot.js(ws库) → cdp_shot.js(简版) → test_shot.js → test_shot2.js → cdp_interact.js(playwright-core)。

4个版本的原因：
1. cdp_screenshot.js用ws库直接连CDP，Node.js 24的WebSocket对大响应(截图base64)有bug
2. 改用playwright-core的connectOverCDP，发现更稳定
3. 但没删旧的ws库版本

### 教训
CDP截图的正确方案是 playwright-core + connectOverCDP + page.screenshot()。
ws库 + CDP原生Page.captureScreenshot 在Node.js 24下会超时。
这个教训在ERROR_LOG里记录了3次，但每次写新脚本时都没删旧的。

## 2.3 PowerShell here-string + 中文 = 编码毁灭

### 问题(经验#38)
用PowerShell here-string写Node.js脚本时，嵌套双引号导致JS SyntaxError，中文路径导致乱码。

### 根因
PowerShell的here-string和Node.js的字符串转义规则冲突。

### 教训
写含中文的Node.js脚本时，用apply_patch创建.cjs文件，不用PowerShell here-string。
这条教训在2.7.0后又重新违反了一次(本次追加LESSONS_LEARNED.md时)。

## 2.4 测试脚本选择器不匹配HTML

### 问题(ERROR_LOG #1-#4, #14-#15)
测试脚本用 getElementById('skill-list-constraint') 但HTML用 class='skill-list'。
测试脚本用 getElementById('sidebar') 但实际ID是 'app-sidebar'。

### 根因
写测试脚本前没读renderer.html确认实际DOM结构，凭猜测写选择器。

### 教训
写测试脚本前必须先CDP扫描DOM结构，用实际存在的ID/class。

## 2.5 Runtime.evaluate vs Input.dispatchMouseEvent

### 问题(经验#22, 教训#56)
所有CDP验证脚本都用Runtime.evaluate直接调函数(app._toggleScBind等)。
这绕过了DOM事件链路，验证永远"通过"，但用户真实点击会失败。

### 根因
Runtime.evaluate更快更简单，Input.dispatchMouseEvent需要计算屏幕坐标、模拟mouseMoved→mousePressed→mouseReleased三步。
我选了更快的方法，违反了规则18"行为验证"。

### 教训
CDP验证脚本必须用Input.dispatchMouseEvent模拟真实点击。
real_click_v3.mjs是正确实现(已删除)，以后CDP验证应该复用这个模式。

## 2.6 测试脚本假设UI状态

### 问题(教训#13)
e2e_p1fix.js假设流水线在卷纲步骤，但实际应用在章节步骤，导致找不到按钮。

### 根因
测试脚本不能假设应用处于某个UI状态。必须先导航到正确的步骤/面板，再测试交互。

### 教训
E2E测试脚本开头必须先检测当前状态，再导航到目标状态，最后测试。

---

# 三、有用脚本的特征分析

## 3.1 check_css.js (33行) — 保留
用途: 检查style.css花括号平衡(FINAL_DEPTH应为0)。
为什么有用: 简单、单一职责、每次改CSS后必用、规则19要求。
改进: 可以集成到pre-commit hook。

## 3.2 find_rules.js (56行) — 保留
用途: 查找CSS规则在style.css中的行号。
为什么有用: 精确定位CSS规则位置，避免盲改。
改进: 可以扩展为CDP getComputedStyle对比工具。

## 3.3 verify_all.js (269行) — 保留
用途: 全量验证(语法检查+CSS花括号+面板打开+功能测试+持久化+截图)。
为什么有用: 覆盖面广，是verify_ui系列的最终版本。
改进: 应该把verify_ui_v2/v3/all/all4/fix5的内容合并进verify_all.js然后删掉旧版本。

---

# 四、以后写脚本的铁律

## 铁律1: 新脚本必须先删旧脚本
写新版本前，先删旧版本文件。不创建新文件名，直接覆盖。

## 铁律2: 不用PowerShell here-string写含中文的脚本
用apply_patch创建.cjs文件，或用Node.js fs.writeFileSync。

## 铁律3: 写测试脚本前先扫描DOM
用CDP Runtime.evaluate扫描实际DOM结构，确认ID/class存在再写选择器。

## 铁律4: CDP验证用Input.dispatchMouseEvent
不用Runtime.evaluate直接调函数。用真实鼠标坐标点击。

## 铁律5: 测试脚本开头先检测UI状态
不假设应用处于某个状态。先检测、导航、再测试。

## 铁律6: 临时脚本用完即删
一次性脚本(探针、调试)用完当天删除，不堆积在根目录。

## 铁律7: 有用脚本统一管理
check_css.js、find_rules.js、verify_all.js 放到scripts/目录，不放根目录。

---

# 五、脚本踩坑统计

| 问题类型 | 出现次数 | 影响 |
|----------|----------|------|
| 同功能多版本堆积 | 3次(verify_ui 5版/cdp_shot 4版/test_shot 2版) | 根目录混乱 |
| PowerShell写中文脚本失败 | 4次(经验#38+本次) | 编码乱码 |
| 选择器不匹配HTML | 6次(ERROR_LOG #1-4,14,15) | 测试假阳性 |
| Runtime.evaluate假验证 | 全程 | 验证永远"通过"但用户实测失败 |
| 假设UI状态 | 2次(教训#13) | 测试找不到元素 |

**总结**: 脚本写错的核心原因是"不验证就写"——写脚本前不读DOM结构、不删旧脚本、不用正确的验证方法。
和经验总结的教训一样：凭印象工作，不凭证据。
