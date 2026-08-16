# 差异检测机制完整计划

> 生成时间: 2026-08-11
> 目标: 用旧架构行为手册(23层)的差异检测规则作为基准，自动化检测新架构Vue3代码是否符合旧架构行为规格，生成差异矩阵报告(MATCH/MISMATCH/MISSING)，指导精准修复

---

## 一、当前状态基线

### 已完成

1. 旧架构行为手册23层全部完成(T01-T23 + INDEX + 验证报告)，总计234KB，逐层PASS
2. Vue3迁移P0-P14全部完成(checkpoint.md)，390+测试PASS
3. 手册格式分析完成，确认5种差异检测规则格式分布

### 手册格式分布(实际扫描结果)

| 层级 | 差异检测规则 | 必须保留 | 必须修复 | 迁移注意 | 差异检测要点 | 可改进 |
|------|:---:|:---:|:---:|:---:|:---:|:---:|
| T01 数据层 | N | Y | N | Y | N | N |
| T02 调用链层 | N | Y | N | Y | N | N |
| T03 功能系统层 | N | N | N | Y | N | N |
| T04 交互流程层 | N | N | N | Y | N | N |
| T05 渲染层 | N | N | N | Y | N | N |
| T06 事件层 | Y | N | N | Y | N | N |
| T07 生命周期层 | Y | N | N | Y | N | N |
| T08 持久化层 | Y | Y | N | Y | Y | Y |
| T09 网络层 | Y | Y | N | N | Y | Y |
| T10 错误处理层 | Y | Y | N | Y | Y | Y |
| T11 性能层 | Y | Y | N | N | Y | Y |
| T12 配置层 | Y | Y | N | N | Y | Y |
| T13 IPC边界层 | Y | Y | N | N | Y | Y |
| T14 应用级状态机 | Y | Y | N | N | Y | Y |
| T15 编码与文本处理层 | Y | Y | N | N | Y | Y |
| T16 安全边界层 | Y | Y | Y | N | Y | N |
| T17 版本迁移层 | Y | Y | N | N | Y | N |
| T18 焦点与无障碍层 | Y | Y | N | N | Y | Y |
| T19 构建与打包层 | Y | Y | N | N | Y | Y |
| T20 定时器与异步层 | N | N | N | Y | N | N |
| T21 Electron主进程层 | N | N | N | Y | N | N |
| T22 数据流向层 | N | N | N | Y | N | N |
| T23 外部依赖层 | N | N | N | Y | N | N |

5种格式:
1. "差异检测规则：xxx必须保持；yyy必须保持" (T06-T19部分层)
2. "必须保留：xxx；必须修复：yyy" (T16-T19)
3. "迁移注意" + 编号列表 (T20-T23, T03-T05)
4. "差异检测要点" + 表格/段落 (T08-T19)
5. 散落在正文的"迁移注意"段落 (T01-T05)

### Vue3项目结构(扫描目标)

```
src/
  App.vue
  main.ts
  components/ (32个.vue文件)
    chat/ (ChatMessage, ChatPanel)
    common/ (BreadcrumbBar, ContextMenu, DiffModal, ExitConfirmModal, InlineMenu, MemoryPanel, OutlineWorkspace, PanelResizer, PluginMarket)
    dashboard/ (DashboardModal)
    deai/ (DeAiButton, DeAiFlowPreview, DeAiModeCard, DeAiProgress, DeAiSkillSelector)
    editor/ (EditorPanel)
    pipeline/ (PipelinePanel)
    settings-collection/ (ScPanel)
    settings/ (AgentSettings, ApiSettings, AppearanceSettings, DeAiSettings, DiagLogPanel, SettingsModal, SkillSettings)
    sidebar/ (AgentProgressPanel, ChapterTree, ContextMenu, SidebarNav)
  composables/ (8个.ts文件)
  services/ (21个.js/.ts文件)
  stores/ (10个.ts文件)
  styles/ (3个.css文件)
electron/
  main.js, preload.ts
```

### 已知缺陷

- extract_rules.js有重复声明bug(apply_patch追加而非替换)，rules_raw.json只有1条规则
- 14层手册有结构化差异检测规则，9层只有迁移注意段落需要人工提取
- 旧extract_rules.js只支持2种pattern，需要支持全部5种

---

## 二、完整执行计划(6个Phase / 20个步骤)

### Phase 1: 规则提取 (P1-P4)

**目标**: 从23层手册提取全部差异检测规则，预期100-150条

#### P1: 重写extract_rules.js

**操作**: 删除旧文件，用Write工具完全重写(教训: apply_patch对已有文件是追加不是替换)

**脚本逻辑**:

```javascript
// 支持5种pattern:
// Pattern A: "差异检测规则：" 后跟分号分隔的规则句
// Pattern B: "必须保留：" + "必须修复：" + "可改进：" 段落
// Pattern C: "## 迁移注意" + 编号列表(1. 2. 3.)
// Pattern D: "差异检测要点" 章节下的"必须保留/必须修复" 段落
// Pattern E: 散落在正文的"迁移注意" 段落(T01-T05)

// 对每条规则自动分类:
// - type=existence: 检查某函数/变量/配置项是否存在于Vue3代码中
// - type=value: 检查某默认值/格式/路径是否正确
// - type=behavior: 检查某操作的输入输出行为是否一致
// - type=state: 检查操作后的应用状态是否一致

// 对每条规则标注目标文件:
// - 根据 layer -> 手册中提到的源码文件 -> 映射到 Vue3 对应文件
```

**产出**: `rules_raw.json`，包含 {id, layer, category, rule, type, target, check} 结构的规则数组

**验证**: 规则数量 >= 100；覆盖全部23层；无重复规则

**经验引用**: 教训#80(大文件写独立.js文件)；规则13(禁PowerShell Set-Content改中文文件)

#### P2: 规则分类标注

**操作**: 读取rules_raw.json，对每条规则补充分类信息

**分类维度**:

| 检查类型 | 说明 | 检测方法 | 示例 |
|---------|------|---------|------|
| existence | 函数/变量/配置项是否存在 | 静态扫描源码 | "storageRead方法必须存在" |
| value | 默认值/格式/路径是否正确 | 静态扫描值 | "temperature默认0.7必须保持" |
| behavior | 操作行为是否一致 | Playwright操作UI | "点击设置按钮打开设置面板" |
| state | 操作后状态是否一致 | Playwright+store检查 | "保存后provider列表更新" |

**产出**: `rules_classified.json`

**验证**: 每条规则都有明确的type和target_file；existence/value规则有搜索关键词；behavior/state规则有操作步骤和预期结果

#### P3: 规则到Vue3文件映射

**操作**: 为每条规则标注对应的Vue3文件路径

**映射表**(手册层级 -> Vue3文件):

| 手册层 | 旧架构源文件 | Vue3对应文件 |
|-------|-----------|-------------|
| T01 数据层 | js/storage.js | services/storage.js, stores/*.ts |
| T02 调用链层 | renderer_v2.js _aiRequest | composables/useAiRequest.ts, services/*.js |
| T03 功能系统层 | renderer_v2.js 各功能 | components/**/*.vue |
| T04 交互流程层 | renderer_v2.js 事件 | components/**/*.vue, composables/useShortcuts.ts |
| T05 渲染层 | panels.js, renderer_v2.js | components/**/*.vue |
| T06 事件层 | renderer_v2.js bindEvents | composables/useShortcuts.ts, components/**/*.vue |
| T07 生命周期层 | renderer_v2.js init() | App.vue, main.ts, composables/*.ts |
| T08 持久化层 | js/storage.js, main.js | services/storage.js, electron/main.js |
| T09 网络层 | renderer_v2.js fetch/SSE | composables/useAiRequest.ts |
| T10 错误处理层 | renderer_v2.js try/catch | services/diag.js, composables/*.ts |
| T11 性能层 | renderer_v2.js debounce/lazy | composables/*.ts, components/**/*.vue |
| T12 配置层 | renderer_v2.js settings | stores/settings.ts, stores/provider.ts |
| T13 IPC边界层 | preload.js, main.js | electron/preload.ts, electron/main.js |
| T14 应用级状态机 | renderer_v2.js 全局变量 | stores/*.ts |
| T15 编码与文本处理层 | renderer_v2.js encoding | services/file-import.ts |
| T16 安全边界层 | main.js, preload.js | electron/main.js, electron/preload.ts |
| T17 版本迁移层 | renderer_v2.js migrate() | services/storage.js, electron/main.js |
| T18 焦点与无障碍层 | renderer_v2.js hotkeys | composables/useShortcuts.ts |
| T19 构建与打包层 | electron-builder config | package.json, electron-builder.yml |
| T20 定时器与异步层 | renderer_v2.js timers | composables/*.ts, App.vue |
| T21 Electron主进程层 | main.js | electron/main.js |
| T22 数据流向层 | renderer_v2.js 数据流 | stores/*.ts, services/*.js |
| T23 外部依赖层 | package.json deps | package.json |

**产出**: `rules_mapped.json`

**验证**: 每条规则映射到至少1个Vue3文件；文件路径全部实际存在(用fs.existsSync校验)

#### P4: 规则完整性校验

**操作**: 对rules_mapped.json做完整性检查

**检查项**:
1. 每条规则有唯一id
2. 每条规则有layer
3. 每条规则有type(existence/value/behavior/state)
4. 每条规则有target_file(至少1个)
5. 每条规则有search_keyword或operation_step
6. 无重复规则(按rule字段去重)
7. 全部23层都有覆盖

**产出**: `rules_final.json`，通过校验的最终规则集

**验证**: 校验报告全PASS，规则集冻结，后续Phase引用此文件

---

### Phase 2: 静态检测引擎 (P5-P8)

**目标**: 扫描Vue3源码，检查existence和value类型规则

#### P5: 静态检测引擎核心

**操作**: 编写 `static_checker.js`

**逻辑**:

```javascript
// 读取 rules_final.json
// 过滤 type=existence 和 type=value 的规则
// 对每条规则:
//   1. 读取 target_file 指定的Vue3源码文件
//   2. 用 search_keyword 在源码中搜索
//   3. existence规则: 搜索到关键词 -> MATCH, 搜索不到 -> MISSING
//   4. value规则: 搜索到关键词后提取值, 与预期值比对 -> MATCH/MISMATCH
//   5. 记录结果: {rule_id, layer, type, status, detail, evidence}
```

**关键检查项举例**:

| 规则 | 类型 | 搜索目标 | 预期 |
|------|------|---------|------|
| contextIsolation必须为true | value | electron/main.js中contextIsolation | true |
| nodeIntegration必须为false | value | electron/main.js中nodeIntegration | false |
| storageRead方法必须存在 | existence | services/storage.js | 包含storageRead函数 |
| temperature默认0.7 | value | stores/provider.ts或services/provider-manager.js | 0.7 |
| maxTokens默认128000 | value | 同上 | 128000 |
| safeStorage加密 | existence | electron/main.js | 包含safeStorage/encryptString |
| wa_前缀 | existence | services/storage.js | PREFIX = 'wa_' |
| purpose三值分类 | existence | services/provider-manager.js | generate/verify/detect |

**产出**: `static_results.json`

**验证**: existence和value类型规则全部检查完毕，无遗漏

**经验引用**: 教训#81(检查DOM不检查全局变量) -- 静态检测只看源码文本，不依赖运行时

#### P6: 静态检测结果分类

**操作**: 对static_results.json做分类汇总

**分类**:
1. MATCH: 规则要求在Vue3代码中找到匹配
2. MISMATCH: 找到关键词但值不对
3. MISSING: 关键词完全不存在
4. SKIP: 文件不存在或无法读取

**产出**: `static_summary.json`

**验证**: 汇总数 = 规则总数；MATCH+MISMATCH+MISSING+SKIP = 规则总数

#### P7: 静态差异报告生成

**操作**: 将static_results.json转为可读的Markdown报告

**报告格式**:

```markdown
# 静态检测差异报告

## 汇总
- 总规则数: N
- MATCH: N (xx%)
- MISMATCH: N (xx%)
- MISSING: N (xx%)

## 逐层详情
### T01 数据层
| 规则ID | 规则描述 | 类型 | 状态 | 详情 |
|--------|---------|------|------|------|
| R001 | storageRead方法必须存在 | existence | MATCH | 在services/storage.js:42找到 |
| R002 | temperature默认0.7 | value | MISMATCH | 实际值0.5, 预期0.7 |
```

**产出**: `static_report.md`

**验证**: 报告包含全部existence和value规则结果

#### P8: 静态MISMATCH/MISSING修复(可选)

**操作**: 根据报告中的MISMATCH和MISSING项，逐个检查是否为真问题

**分类处理**:
1. 真缺陷: Vue3代码确实缺失 -> 记录到修复清单
2. 合理替代: Vue3用了不同的实现方式但行为等价 -> 标记为ACCEPTABLE
3. 环境限制: 开发环境与生产环境差异 -> 标记为ENV_LIMIT(教训#99)

**产出**: `static_fix_list.json`

**验证**: 每个MISMATCH/MISSING都有处理结论

---

### Phase 3: 行为检测引擎 (P9-P12)

**目标**: 用Playwright操作Vue3应用UI，验证behavior类型规则

#### P9: 行为检测脚本框架

**操作**: 编写 `behavior_checker.js`

**前提**: dev server在localhost:5173运行中

**框架**:

```javascript
const { chromium } = require('playwright');

// 读取 rules_final.json，过滤 type=behavior 的规则
// 每条behavior规则有 operation_step (操作步骤) 和 expected_result (预期结果)
// 对每条规则:
//   1. 启动浏览器，导航到 localhost:5173
//   2. 执行 operation_step (点击按钮/输入文本/切换tab等)
//   3. 检查 expected_result (DOM状态/class变化/内容显示等)
//   4. 截图保存证据
//   5. 记录结果: {rule_id, layer, status, screenshot, dom_evidence}
```

**关键检查项举例**:

| 规则 | 操作步骤 | 预期结果 | 检查方法 |
|------|---------|---------|----------|
| 点击设置按钮打开设置面板 | 点击#btn-settings | .settings-modal可见 | 检查元素display不为none |
| Ctrl+1切换到大纲工作台 | 按Ctrl+1 | outline-workspace overlay显示 | 检查class或style |
| 发送消息后流式输出 | 输入文本+点击发送 | 消息出现在消息列表 | 检查DOM子元素增加 |
| 切换主题 | 点击主题切换按钮 | body class变化 | 检查class属性 |
| 章节树右键菜单 | 右键章节项 | 上下文菜单显示 | 检查元素可见性 |
| 去AI味3模式切换 | 点击模式卡片 | 对应配置区域显示 | 检查v-if/v-show状态 |

**产出**: `behavior_results.json` + 截图目录 `screenshots/`

**验证**: behavior类型规则全部执行完毕

**经验引用**: 教训#80(行为检测用Playwright写独立.js文件)；教训#81(检查DOM不检查全局变量)

**防空转**: 同一脚本连续失败2次，强制换方法(换selector/换等待策略)；截图超时给予超长时间等待

#### P10: 行为检测脚本分组执行

**操作**: 按功能模块分组执行behavior检测

**分组**(避免单脚本过大导致超时):

| 组 | 涉及层级 | 测试项 | 前置条件 |
|---|---------|-------|----------|
| 导航组 | T04/T06/T18 | 侧栏7按钮+快捷键+Escape | 无 |
| 设置组 | T12/T16 | 6个tab+供应商CRUD+保存 | 无 |
| 编辑器组 | T03/T15 | 撤销/重做/查找替换/内联AI菜单 | 需有内容 |
| 聊天组 | T03/T09 | 发送/流式/复制/重生成/应用 | 需有供应商配置 |
| 章节树组 | T03/T04 | 右键/拖拽/重命名/卷编辑 | 需有项目+章节数据 |
| 流水线组 | T03/T09 | 大纲->设定->卷纲->章节->正文 | 需有大纲文本 |
| 去AI味组 | T03/T12 | 3模式切换+SKILL选择+执行 | 需有SKILL+Agent配置 |
| 供应商组 | T12/T09 | 获取模型+测试连接+用途切换+多供应商 | 需有API配置 |

**产出**: 每组一个JSON报告 + 截图

**验证**: 8组全部执行完毕，无SKIP项

#### P11: 行为检测结果汇总

**操作**: 合并8组结果为统一的behavior_results.json

**分类**:
1. MATCH: 操作后预期行为发生
2. MISMATCH: 操作成功但行为与预期不一致
3. FAILED: 操作本身失败(元素不存在/点击无效)
4. ERROR: 脚本执行异常(超时/崩溃)

**产出**: `behavior_summary.json`

**验证**: 汇总数 = behavior规则数；FAILED和ERROR项有详细原因

#### P12: 行为差异报告生成

**操作**: 生成行为检测的Markdown报告

**报告包含**: 逐层行为检查结果 + 截图引用 + 失败项分析

**产出**: `behavior_report.md`

**验证**: 报告包含全部behavior规则结果 + 截图路径

---

### Phase 4: 状态检测引擎 (P13-P15)

**目标**: 操作后检查Vue3 store/localStorage状态一致性

#### P13: 状态检测脚本

**操作**: 编写 `state_checker.js`

**逻辑**:

```javascript
// 读取 rules_final.json，过滤 type=state 的规则
// 对每条规则:
//   1. 执行前置操作(如: 添加供应商 -> 保存)
//   2. 通过Playwright的page.evaluate()读取Vue3的Pinia store状态
//   3. 同时读取localStorage(通过storage.js的key)
//   4. 对比 store状态 与 localStorage状态 是否一致
//   5. 对比 store状态 与 预期状态 是否一致
```

**关键检查项举例**:

| 规则 | 操作 | 检查store | 检查localStorage | 预期 |
|------|------|----------|----------------|------|
| 供应商保存后持久化 | 添加+保存供应商 | providerStore.providers.length | wa_providers JSON.parse | 长度一致且>0 |
| 主题切换持久化 | 切换暗色主题 | themeStore.theme | wa_app-theme | 值一致为dark |
| 去AI味配置持久化 | 配置+保存SKILL | deaiStore.config | wa_app-deai-config | config结构一致 |
| 章节数据持久化 | 添加章节 | chapterStore.volumes | wa_chapters_{projectId} | volumes结构一致 |
| 多供应商purpose | 设置供应商用途 | providerStore.providers[i].purpose | wa_providers | purpose值一致 |

**产出**: `state_results.json`

**验证**: state类型规则全部执行完毕

**经验引用**: 教训#77(Array分支读purpose)；教训#78(baseUrl含/vN后缀检查)

#### P14: 状态检测结果分类

**操作**: 对state_results.json做分类

**分类**:
1. MATCH: store和localStorage状态一致且符合预期
2. MISMATCH: 状态存在但值不对
3. STORE_MISSING: store中没有该状态
4. STORAGE_MISSING: localStorage中没有该键
5. DESYNC: store和localStorage不同步

**产出**: `state_summary.json`

**验证**: 汇总数 = state规则数；DESYNC项有详细差异

#### P15: 状态差异报告生成

**操作**: 生成状态检测的Markdown报告

**产出**: `state_report.md`

**验证**: 报告包含全部state规则结果

---

### Phase 5: 差异报告生成 (P16-P18)

**目标**: 汇总三个引擎的结果，生成最终差异矩阵

#### P16: 三引擎结果合并

**操作**: 编写 `merge_results.js`

**逻辑**:

```javascript
// 读取 static_results.json + behavior_results.json + state_results.json
// 合并为统一的差异矩阵
// 每条规则: {rule_id, layer, category, type, rule_text, engine, status, detail, evidence, screenshot?}
// 按层级分组排序
```

**产出**: `diff_matrix.json`

**验证**: 合并后规则数 = rules_final.json的规则数

#### P17: 修复优先级排序

**操作**: 对MISMATCH/MISSING/FAILED/DESYNC项按优先级排序

**优先级矩阵**:

| 优先级 | 条件 | 示例 |
|-------|------|------|
| P0-致命 | 核心功能完全不可用 + behavior FAILED | 发送消息无效、保存无效、应用闪退 |
| P1-严重 | 数据丢失/不一致 + state DESYNC | 供应商保存后重启丢失、store与localStorage不同步 |
| P2-中等 | 默认值不正确 + value MISMATCH | temperature不是0.7、maxTokens不是128000 |
| P3-轻微 | 存在但行为有差异 + behavior MISMATCH | 动画缺失、交互反馈不一致 |
| P4-可接受 | 合理的架构差异 | Vue3用composable替代旧事件委托 |

**产出**: `fix_priority.json`

**验证**: 每个非MATCH项都有优先级标签

#### P18: 最终差异报告

**操作**: 生成最终的综合差异报告Markdown

**报告结构**:

```markdown
# Vue3迁移差异检测最终报告

## 1. 执行摘要
- 检测时间
- 规则总数 / MATCH / MISMATCH / MISSING / FAILED
- 整体匹配率
- P0/P1问题数量

## 2. 差异矩阵总览(按层级)
| 层级 | 规则数 | MATCH | MISMATCH | MISSING | FAILED | 匹配率 |
|------|-------|-------|---------|---------|--------|-------|
| T01  | 8     | 7     | 0       | 1       | 0      | 87.5% |
...

## 3. P0致命问题清单
### P0-001: [问题描述]
- 规则ID: R012
- 层级: T06事件层
- 类型: behavior
- 详情: 点击btn-settings后设置面板未显示
- 证据: screenshots/behavior_012_fail.png
- Vue3文件: components/settings/SettingsModal.vue
- 修复建议: 检查v-model绑定和visible状态

## 4. P1严重问题清单
...

## 5. P2-P4问题清单
...

## 6. 可接受差异清单
...

## 7. 建议修复顺序
1. P0全部修复(阻塞性)
2. P1全部修复(数据安全)
3. P2按影响范围修复
4. P3按用户感知修复
5. P4记录但不修复
```

**产出**: `DIFF_FINAL_REPORT.md`

**验证**: 报告包含全部规则结果；P0/P1项有明确修复建议和文件位置

---

### Phase 6: 验证与经验更新 (P19-P20)

#### P19: 报告交叉验证

**操作**: 对最终报告做交叉验证

**验证项**:
1. 规则总数 = Phase 1冻结的rules_final.json数量
2. 三引擎结果全部汇入，无遗漏
3. 每个MISMATCH/MISSING/FAILED项都有优先级
4. 每个P0/P1项都有Vue3文件路径和修复建议
5. 截图文件全部存在(行为检测和状态检测的截图)
6. JSON文件全部可解析(无语法错误)

**产出**: `verification_report.md`

**验证**: 全部6项PASS

#### P20: 经验文件更新

**操作**: 更新LESSONS_LEARNED.md

**记录内容**:
1. 差异检测机制的5种手册格式处理方法
2. extract_rules.js的重复声明bug教训(apply_patch追加问题)
3. 三引擎(静态/行为/状态)的分工和各自适用场景
4. 优先级矩阵的使用效果
5. 防空转协议执行情况

**产出**: 更新后的LESSONS_LEARNED.md

---

## 三、执行约束(铁律)

### 工具约束

1. 禁止PowerShell Set-Content修改含中文文件(规则13) -- 所有.js脚本用Write工具写入
2. apply_patch对已有文件是追加不是替换 -- 需要先删文件再写，或用Write工具完全重写
3. node -e不能处理多行中文 -- 必须写独立.js文件执行
4. 行为检测用Playwright写独立.js文件(教训#80)
5. 检测结果区分"代码缺陷"vs"环境限制"(教训#99)

### 防空转协议

1. 每步完成后立刻写checkpoint.md + update_plan，不允许只在脑子里记
2. 同一方法连续失败2次，强制换路径，禁止第3次重试同一方法
3. 派子Agent时必须真正spawn，不能只说"我去派"然后不派
4. 子Agent因网络原因失败时，给予充足等待时间重试
5. 每30s给用户一条进度更新，连续两条说同样的话 = 空转信号

### 精准修复

1. 禁止批量行为 -- 逐个精准操作
2. 禁止批量正则替换 -- 逐处修复
3. 修改前先读代码再改
4. 修改后立即node --check验证语法

### Agent使用

1. 调用工具前先确认工具在可用列表中
2. 不在列表中时先tool_search加载
3. tool_search找不到的工具 = 不存在，立即换替代方案
4. 连续两次工具调用失败 -> 停止该路径，换载体(写文件/换语言/换工具)，不换目标
5. 需要外部安装工具时 -> 停止任务告知用户

### 子Agent调度

1. 重新启动子Agent前必须先关闭之前的子Agent释放线程
2. 子Agent的上下文独立，不会被主线程污染 -- 利用这点做并行扫描
3. 可并行的任务: P5-P7(静态检测各组独立)、P9-P11(行为检测各组独立)
4. 不可并行的任务: P1-P4(规则提取有依赖链)、P16-P18(结果合并依赖三引擎完成)

---

## 四、产出文件清单

| 文件 | 产出阶段 | 用途 |
|------|---------|------|
| rules_raw.json | P1 | 原始规则提取 |
| rules_classified.json | P2 | 规则分类标注 |
| rules_mapped.json | P3 | 规则到Vue3文件映射 |
| rules_final.json | P4 | 冻结的最终规则集 |
| static_checker.js | P5 | 静态检测引擎脚本 |
| static_results.json | P5 | 静态检测结果 |
| static_summary.json | P6 | 静态检测汇总 |
| static_report.md | P7 | 静态检测报告 |
| static_fix_list.json | P8 | 静态修复清单 |
| behavior_checker.js | P9 | 行为检测引擎脚本 |
| behavior_results.json | P11 | 行为检测结果汇总 |
| behavior_summary.json | P11 | 行为检测汇总 |
| behavior_report.md | P12 | 行为检测报告 |
| state_checker.js | P13 | 状态检测引擎脚本 |
| state_results.json | P13 | 状态检测结果 |
| state_summary.json | P14 | 状态检测汇总 |
| state_report.md | P15 | 状态检测报告 |
| diff_matrix.json | P16 | 合并差异矩阵 |
| fix_priority.json | P17 | 修复优先级清单 |
| DIFF_FINAL_REPORT.md | P18 | 最终差异报告 |
| verification_report.md | P19 | 交叉验证报告 |
| LESSONS_LEARNED.md(更新) | P20 | 经验更新 |
| checkpoint.md(更新) | 每步 | 断点续接 |

全部文件存放在: `D:/codex/novel-workshop-vue3/_audit/diff-engine/`

---

## 五、可并行任务规划

### 可并行的任务(用子Agent)

1. **静态检测P5**: 只需读取Vue3源码文件，不依赖运行时 -- 可派1个子Agent并行扫描多个层级
2. **行为检测P9-P10**: 8组测试相互独立 -- 可派多个子Agent并行执行不同组
3. **手册分析**: 可派子Agent读取手册各层，辅助验证规则提取的完整性

### 不可并行的任务

1. **P1-P4规则提取**: 有依赖链(P1产出->P2输入->P3输入->P4校验)
2. **P16-P18结果合并**: 依赖三引擎全部完成
3. **P19-P20验证更新**: 依赖最终报告完成

### 子Agent使用注意事项

1. 重新spawn子Agent前必须关闭之前的子Agent(经验: 释放线程)
2. 子Agent触发429时关闭旧子Agent释放配额再试(规则18)
3. 子Agent的任务描述必须包含完整的上下文(子Agent看不到主线程对话)
4. 子Agent的输出要写入文件，不能只在内存中传递

---

## 六、验证矩阵

| 验证项 | 验证方法 | 通过标准 |
|-------|---------|----------|
| V1: 规则完整性 | rules_final.json覆盖全部23层，无重复 | 规则数>=100，23层全覆盖 |
| V2: 静态检测覆盖 | static_results.json包含全部existence+value规则 | 规则数=existence+value之和 |
| V3: 行为检测覆盖 | behavior_results.json包含全部behavior规则 | 8组全执行，无SKIP |
| V4: 状态检测覆盖 | state_results.json包含全部state规则 | 规则数=state之和 |
| V5: 三引擎合并 | diff_matrix.json规则数=rules_final.json | 数量一致 |
| V6: 优先级排序 | 每个非MATCH项有P0-P4标签 | 无遗漏 |
| V7: 证据完整 | P0/P1项有截图+DOM证据+文件路径 | 三者缺一未通过(规则14) |
| V8: JSON合法性 | 全部JSON文件可JSON.parse | 无语法错误 |
| V9: 报告可读性 | DIFF_FINAL_REPORT.md包含汇总+逐层+修复建议 | 结构完整 |
| V10: 经验更新 | LESSONS_LEARNED.md记录本次教训 | 新增条目 |

---

## 七、执行顺序总结

```
P1(重写extract_rules.js)
  -> P2(规则分类) -> P3(文件映射) -> P4(完整性校验)
    -> P5(静态检测) -> P6(静态汇总) -> P7(静态报告) -> P8(静态修复清单)
      -> P9(行为检测框架) -> P10(分组执行) -> P11(行为汇总) -> P12(行为报告)
        -> P13(状态检测) -> P14(状态汇总) -> P15(状态报告)
          -> P16(三引擎合并) -> P17(优先级排序) -> P18(最终报告)
            -> P19(交叉验证) -> P20(经验更新)
```

Phase 1(P1-P4)必须串行执行，有依赖链。
Phase 2-4(P5-P15)三个引擎可以并行执行(用子Agent)。
Phase 5-6(P16-P20)必须串行执行，依赖三引擎完成。

---

*计划版本: v1.0 | 生成时间: 2026-08-11 | 生成者: Codex (GPT-5)*
