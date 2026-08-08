# 去AI味硬规则执行顺序修复报告

## 版本: v2.7.44 (硬规则顺序修复)
## 日期: 2026-08-05

## 一、问题描述

用户实操发现：点击去AI味后，进度框显示的顺序是「先白虎SKILL，后硬规则」，缺少前置硬规则清洗步骤。

正确的设计顺序应为：
```
硬规则清洗(确定性) → 白虎S1重述(语义级) → 白虎S2验证(语义级) → 硬规则安全网(确定性)
```

## 二、根因分析

renderer_v2.js 的 `deAiProcess()` 方法中存在3处缺陷：

| 缺陷 | 位置 | 问题 |
|------|------|------|
| 1. 串行模式steps数组缺少前置硬规则 | L591-602 | steps只包含SKILL + 末尾hardrule，没有hardrule-pre |
| 2. Agent调度模式缺少切分前硬规则 | L576-582 | split-merge分支直接切分，未先跑硬规则清洗 |
| 3. 流程预览缺少安全网步骤 | L1178-1182 | _updateFlowPreview中steps[0]覆盖逻辑错误，缺少硬规则安全网 |

## 三、修复内容

### 修复1: 串行模式steps数组 (L594-608)

修复前：
```js
var steps = [];
if (cfg.skills && cfg.skills.length > 0) { ... steps.push({ type: "skill" ... }); }
if (cfg.hardRulesEnabled) { steps.push({ type: "hardrule", name: "硬规则处理" }); }
```

修复后：
```js
var steps = [];
if (cfg.hardRulesEnabled) { steps.push({ type: "hardrule-pre", name: "硬规则清洗" }); }
if (cfg.skills && cfg.skills.length > 0) { ... steps.push({ type: "skill" ... }); }
if (cfg.hardRulesEnabled) { steps.push({ type: "hardrule-post", name: "硬规则安全网" }); }
```

### 修复2: 执行循环条件 (L685)

修复前：`else if (step.type === "hardrule")`
修复后：`else if (step.type === "hardrule-pre" || step.type === "hardrule-post")`

### 修复3: Agent调度模式前置硬规则 (L577-579)

修复前：直接进入split-merge
修复后：切分前先执行 `DeAiProcessor.process(text, cfg)` 清洗文本

### 修复4: 流程预览 (L1177, L1186)

修复前：chain模式只显示一个硬规则清洗，没有安全网
修复后：chain模式显示 `硬规则清洗→SKILL→硬规则安全网→完成`

## 四、CDP行为验证结果

验证方式：通过CDP连接运行中的Electron实例(端口9223)，注入303字测试正文，验证steps数组顺序、流程预览内容、源码逻辑、process()执行。

| 测试项 | 结果 | 证据 |
|--------|------|------|
| T1 注入正文 | PASS | 303字符注入editor-content成功 |
| T2 DeAiProcessor存在 | PASS | typeof process === function |
| T3 hardRulesEnabled | PASS | _deAiConfig.hardRulesEnabled === true |
| T4 steps顺序 | PASS | hardrule-pre,skill0,skill1,hardrule-post |
| T5 流程预览 | PASS | 硬规则清洗→SKILL1重述→SKILL2重述→硬规则安全网→完成 |
| T6 deAiProcess源码 | PASS | 包含hardrule-pre和hardrule-post |
| T7 Agent模式预处理 | PASS | 包含_hrPre变量 |
| T8 流程预览安全网 | PASS | _updateFlowPreview包含硬规则安全网 |
| T9 无旧hardrule类型 | PASS | 无裸type:"hardrule"，只有pre和post |
| T10 process()执行 | PASS | 去掉4处句首他、合并22处短句、压缩7处感官描写 |

**总计: 10/10 PASS (100%)**

## 五、修复前后对比

### 修复前（用户看到的）
```
进度框:
[1] 白虎S1重述  [done]
[2] 白虎S2验证  [done]
[3] 硬规则处理   [done]
```

### 修复后（用户看到的）
```
进度框:
[1] 硬规则清洗   [done]  ← 新增前置
[2] 白虎S1重述  [done]
[3] 白虎S2验证  [done]
[4] 硬规则安全网 [done]  ← 新增后置
```

流程预览:
硬规则清洗→SKILL1重述→SKILL2重述→硬规则安全网→完成

## 六、修改文件清单

| 文件 | 改动 |
|------|------|
| renderer_v2.js | 5处修复: steps数组重构、执行循环条件、Agent模式前置硬规则、流程预览安全网 |

备份文件: BACKUP/renderer_v2.js.bak.v2.7.44_hardrule_order

## 七、语法验证

node --check renderer_v2.js: EXIT 0 (语法正确)

## 八、经验教训

- 教训#89: 去AI味进度条顺序必须与设计文档一致。设计是 硬规则清洗→SKILL→硬规则安全网，代码里不能只放末尾硬规则。前置硬规则负责清洗AI惯性，后置硬规则负责安全网拦截SKILL引入的新惯性。
- 教训#90: CDP验证T5(flow preview)失败时，需先调用_updateFlowPreview()初始化。设置面板未打开时预览元素为空，这是教训#83的延伸。

报告完毕。
