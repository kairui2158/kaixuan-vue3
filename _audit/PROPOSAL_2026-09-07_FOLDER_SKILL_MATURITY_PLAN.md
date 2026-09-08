# Folder SKILL 成熟度补齐执行计划（待审核）

日期：2026-09-07  
状态：方案待审核，未执行  
依据：真 SKILL 融合台账、Folder SKILL 正文链路修复日志、设置页只读展示收尾、当前源码核对  

## 目标

在不推翻现有 Folder SKILL 底座的前提下，补齐三类能力：

1. 测试可信：设置页“测试”必须真实执行 Folder SKILL，而不是拿旧模板快照发普通请求。
2. 边界透明：compose、split-merge、multi-step、composite 的能力边界必须在执行前和执行中明确可见。
3. 第三方可低成本做对：提供官方规范、校验器、样板包、批量导入和统一诊断展示。

本计划不升级版本号、不封装。每一阶段完成后再由你决定是否进入下一阶段或统一封装。

---

## Phase 0：基线与保护门

### 0.1 开工前置

1. 读取 `_audit/神意开发经验总结_v2.md`。
2. 记录当前 `git status --short`，只触碰本计划列出的文件。
3. 跑基线：
   - `npm run type-check`
   - `npm run test:services`
   - `npm run build:vue`
4. 确认没有源 Electron 残留进程。

### 0.2 保护规则

- 不改文本 SKILL 的既有执行语义。
- 不回退、不清理任何历史未提交改动。
- Folder SKILL 设置页保持只读展示，不恢复应用内编辑。
- 所有新增 UI 文案使用中文。
- 所有验证必须使用源 Electron，不使用网页模式、开发者模式、安装版。

### 0.3 验收

- 基线三项命令全部通过。
- 工作区脏文件清单已记录。

---

## Phase 1（P0）：设置页测试按钮接入真实 Folder 执行器

### 问题

当前 `useSkillTest.ts` 的 `runSkillTest()` 只读取 store 里的 `skill.template`，然后拼一个普通 API 请求。Folder SKILL 改为只读展示后，这个测试路径会带来三个问题：

1. 不加载磁盘上的 `template.md`，可能使用过期模板快照。
2. 不执行 `script.js` 的 preProcess / postProcess。
3. 不校验 `schema.json`，不使用 `samples.txt`，不消耗统一 API 预算。

### 改动文件

- `src/composables/useSkillTest.ts`
- `src/components/settings/SkillSettings.vue`
- 必要时新增 `src/services/folderSkillTest.ts`

### 实现步骤

1. 在 `runSkillTest()` 中识别 `skill.format === 'folder'`。
2. Folder 分支不走旧模板拼装，改为：
   - 通过 `loadRealSkill(skill.folderPath)` 实时加载磁盘包。
   - 使用 `routeSkill()` 或 `executeRealSkill()` 执行。
   - 使用测试专用 `createApiCallBudget()`，默认总预算 3 次，避免测试无限烧请求。
   - `stream: false`，测试结果一次性返回。
3. Agent 解析顺序：
   1. 技能绑定 Agent（若当前上下文存在）。
   2. 应用当前激活 Agent。
   3. 无 Agent 时使用供应商默认参数。
4. 测试弹窗新增只读诊断区：
   - 执行状态：成功 / 降级 / 阻断 / 失败。
   - 磁盘加载状态。
   - API 预算使用量。
   - diagnostics 列表。
   - 可折叠的最终 request messages。
5. 文本 SKILL 测试路径保持现状，不合并、不重构。

### 验证

1. 单元/服务测试：
   - Folder 测试调用真实执行器。
   - script 钩子被执行。
   - schema 校验结果进入诊断。
   - 预算耗尽返回 blocked。
2. 源 Electron UI 验证：
   - 导入一个带 `script.js + schema.json + samples.txt` 的 Folder SKILL。
   - 点击“测试”。
   - 断言请求 system prompt 来自磁盘 `template.md`，不是 store 快照。
   - 断言 diagnostics 显示 script/schema/预算信息。
   - 修改磁盘 `template.md` 后重开测试，确认新模板生效。
3. 回归：
   - 文本 SKILL“测试”按钮行为不变。

### 验收标准

- Folder 测试结果与真实执行链一致。
- 修改磁盘模板后测试立即反映新内容。
- schema 失败、script 失败、预算阻断均有中文诊断。
- 文本 SKILL 测试无回归。

---

## Phase 2（P0）：执行模式边界透明化

### 问题

当前 Folder SKILL 在不同模式下能力不一致：

| 模式 | Folder 真实执行 | script/schema/预算 | per-skill Agent |
|---|---|---|---|
| chain | 是 | 是 | 是 |
| compose（单 folder） | 是 | 是 | 否，使用步骤级 Agent |
| compose（多 folder） | 部分 | 仅第一个 folder 的 script/schema | 否 |
| split-merge | 否，模板文本降级 | 否 | 否 |
| multi-step | 否，模板文本降级 | 否 | 否 |
| composite | 是 | 是 | 子 SKILL 暂无独立 Agent |

### 改动文件

- `src/components/pipeline/PipelinePanel.vue`
- `src/components/settings/SkillSettings.vue`
- 必要时新增 `src/services/folderSkillBoundary.ts`

### 实现步骤

1. 建立统一的边界描述函数，返回每个模式的中文说明：
   - 是否执行 folder script。
   - 是否使用 schema。
   - 是否使用 API 预算。
   - per-skill Agent 是否生效。
2. 生成流水线：
   - 选择 split-merge / multi-step 且包含 folder SKILL 时，在执行前日志提示：“当前模式下文件夹技能仅按模板文本参与，script/schema/预算不会执行。”
   - compose 包含多个 folder SKILL 时，在现有提示基础上补充：“多个文件夹技能合并时，per-skill 智能体不会生效，将使用本层智能体。”
   - compose 包含 folder SKILL 且存在技能级 Agent 绑定时，提示该绑定不会生效。
3. 设置页 Folder 卡片新增“执行边界”只读说明，不提供复杂配置。
4. 不在本阶段改变执行语义，只做透明化。

### 验证

1. 服务测试覆盖边界描述函数的六种模式。
2. 源 Electron 验证：
   - chain 模式无降级提示。
   - compose 多 folder 出现两条提示。
   - split-merge / multi-step 出现模板文本降级提示。
3. 回归：
   - 各模式原有生成结果不变。

### 验收标准

- 用户在执行前能知道 Folder SKILL 哪些能力会失效。
- 不改变现有执行结果，只增加可见性。

---

## Phase 3（P1）：官方 Folder SKILL 规范 + 校验器 + 样板包

### 交付物

1. `_audit/FOLDER_SKILL_SPEC_V1.md`
2. `scripts/validate-folder-skill.cjs`
3. `_audit/folder-skill-template/` 样板包

### 规范内容

1. 目录结构：
   - 必需：`SKILL.md`、`template.md`
   - 可选：`meta.json`、`script.js`、`samples.txt`、`schema.json`
2. `SKILL.md` YAML 字段：
   - `schema`
   - `version`
   - `id`
   - `name`
   - `description`
3. `meta.json` 能力字段：
   - `executionMode`: `single` / `multi-pass` / `composite`
   - `passes`
   - `apiCallLimit`
   - `sampleCount`
   - `smartSamples`
   - `children`
4. `script.js` 钩子协议：
   - `preProcess(input)`
   - `postProcess(output)`
   - `plan(input)`
   - `afterStep(state)`
   - `api.setTemplate(text)`
   - `api.log(message)`
5. 输入输出协议：
   - preProcess 输入是字符串。
   - postProcess 输入是字符串。
   - 允许返回字段白名单。
6. schema 校验规则。
7. chain / compose / split-merge / multi-step / composite 的能力边界表。

### 校验器

`node scripts/validate-folder-skill.cjs <folder-path>`

输出：

1. 必需文件检查。
2. YAML 必填字段检查。
3. `meta.json` JSON 与字段类型检查。
4. `script.js` 导出钩子静态检查。
5. `schema.json` JSON 检查。
6. 样本文件非空检查。
7. 模板变量数量检查。
8. 中文错误报告，退出码非 0 表示校验失败。

约束：

- 不新增 npm 依赖。
- 只做静态校验，不执行脚本、不调用 API。

### 样板包

提供最小可运行样板：

```text
folder-skill-template/
  SKILL.md
  template.md
  meta.json
  samples.txt
```

并附一个 `script.js` 注释示例，说明 preProcess/postProcess 的合法返回值。

### 验证

1. 用现有 8 组夹具跑校验器：
   - 合法包通过。
   - 缺 `SKILL.md` 失败。
   - 缺 `template.md` 失败。
   - `meta.json` 非法失败。
   - `schema.json` 非法失败。
   - script 无导出失败。
2. 样板包可被设置页真实导入并执行。

### 验收标准

- 第三方按规范和校验器能独立制作可导入的 Folder SKILL。
- 校验器无需应用启动即可使用。

---

## Phase 4（P1）：composite / chain 的子技能 Agent 协议

### 设计原则

第三方技能包不能依赖应用内 Agent ID，因为 Agent ID 是用户本地配置。因此第一版采用“技能自带可移植 Agent 默认值”的协议。

### 协议

在子技能 `meta.json` 中允许：

```json
{
  "agent": {
    "model": "optional-model-name",
    "temperature": 0.45,
    "maxTokens": 8192,
    "systemPrompt": "可选，追加在模板前"
  }
}
```

优先级：

1. 用户在应用内显式绑定的 per-skill Agent。
2. 子技能 `meta.agent`。
3. 父技能 / 步骤级 Agent。
4. 供应商默认。

### 改动文件

- `src/services/realSkillTypes.ts`
- `src/services/skillOrchestrator.ts`
- `src/services/realSkillExecutor.ts`
- `src/components/pipeline/PipelinePanel.vue`
- `src/services/realSkillExecutor.spec.ts`
- `src/services/skillOrchestrator.spec.ts`

### 实现步骤

1. `RealSkillMeta` 增加 `agent` 字段类型。
2. chain 模式：
   - 若无应用内绑定 Agent，读取 folder `meta.agent`。
   - 合并 `model/temperature/maxTokens/systemPrompt`。
3. composite 模式：
   - 每个子 SKILL 读取自身 `meta.agent`。
   - 传给 `executeRealSkill()`。
   - 父技能不覆盖子技能已声明的 Agent 默认值。
4. 设置页 Folder 卡片显示子技能 Agent 默认值，只读。
5. compose 模式不实现 per-child Agent，因为一次 API 调用只能有一个 Agent；继续由 Phase 2 的边界提示说明。

### 验证

1. 服务测试：
   - chain 使用 `meta.agent.temperature`。
   - composite 每个子 SKILL 使用各自温度。
   - 应用内显式绑定优先于 `meta.agent`。
   - `meta.agent` 缺省时回退父级/步骤级 Agent。
2. 源 Electron：
   - 三子 SKILL 分别声明 0.45 / 0.85 / 0.55。
   - 断言三次请求温度分别正确。
3. 回归：
   - 未声明 `meta.agent` 的现有技能行为不变。

### 验收标准

- 第三方可以在技能包内声明可移植 Agent 默认值。
- 用户本地显式绑定仍拥有最高优先级。
- compose 边界保持透明，不伪装支持。

---

## Phase 5（P2）：批量导入 Folder SKILL

### 改动文件

- `src/components/settings/SkillSettings.vue`
- `electron/ipc/dialog.js`（如需目录选择增强）
- `electron/preload.js`（如需新增桥接）

### 实现步骤

1. 设置页新增“批量导入文件夹技能”。
2. 用户选择技能根目录。
3. 调用现有 `skill:listFolders` 扫描一级子目录。
4. 显示导入预览表：
   - 技能名。
   - ID。
   - 路径。
   - 是否已存在。
   - 导入策略：新增 / 覆盖 / 跳过。
5. 用户确认后逐个导入。
6. 导入结束显示汇总：
   - 成功数。
   - 跳过数。
   - 失败数及原因。
7. 任一技能失败不回滚已成功技能，但必须明确列出失败项。

### 边界

- 只扫描一级子目录，不递归。
- 每个子目录仍必须包含 `SKILL.md` 和 `template.md`。
- 不自动覆盖，覆盖必须由用户确认。

### 验证

1. 服务测试：
   - 扫描结果过滤无效目录。
   - 冲突 ID 识别正确。
2. 源 Electron：
   - 构造包含 3 个合法、1 个缺 `template.md`、1 个冲突 ID 的目录。
   - 批量导入后确认 3 个成功、1 个失败、1 个按策略处理。
3. 重启后确认导入结果持久化。

### 验收标准

- 第三方可以一次交付多个技能文件夹。
- 导入结果可预期，失败可见。

---

## Phase 6（P2）：统一执行诊断展示

### 问题

executor 已返回 diagnostics、requestMessages、预算记录，但设置页、流水线、共创的展示深度不一致。

### 改动文件

- 新增 `src/components/common/RealSkillDiagnosticsPanel.vue`
- `src/components/settings/SkillSettings.vue`
- `src/components/pipeline/PipelinePanel.vue`
- `src/components/chat/ChatPanel.vue`
- `src/components/common/OutlineWorkspace.vue`

### 面板内容

1. 状态徽标：
   - 成功
   - 降级完成
   - 预算阻断
   - 失败
2. 诊断列表：
   - info / warning / error 分色。
   - 中文说明。
3. API 预算：
   - 已用次数 / 上限。
   - 阻断位置。
4. 请求概览：
   - 默认折叠。
   - 展开 system prompt / user prompt。
5. 失败时提供复制诊断按钮。

### 实现步骤

1. 抽出共享展示组件，不改变执行器返回结构。
2. 设置页测试弹窗接入。
3. 流水线步骤日志接入摘要，详细面板按需展开。
4. 主页共创和大纲工作台接入同一组件。
5. 所有入口不自动展开大段 prompt，避免挤压 UI。

### 验证

1. 源 Electron 分别验证：
   - 设置页测试。
   - 流水线 chain。
   - 流水线 compose。
   - 主页共创。
   - 大纲工作台。
2. 断言五个入口均显示统一状态与诊断。
3. UI 截图检查无遮挡、无溢出。

### 验收标准

- 用户在任何入口都能看到同一套 Folder SKILL 执行诊断。
- 降级、阻断、失败不再只靠一句错误猜测。

---

## Phase 7：总回归与收尾

### 回归命令

1. `npm run type-check`
2. `npm run test:services`
3. `npm run build:vue`

### 源 Electron 验证矩阵

| 场景 | 验证点 |
|---|---|
| 文本 SKILL | 编辑、导出、测试不变 |
| Folder 导入 | 单个导入、批量导入、重启持久化 |
| Folder 测试 | 真实执行器、磁盘模板、script/schema/预算 |
| chain | per-skill Agent、变量解析、DEAI 注入 |
| compose | 合并模板、边界提示 |
| split-merge / multi-step | 边界提示、原行为不变 |
| composite | 子技能顺序、子 Agent 默认值 |
| 主页共创 | 上下文、Agent 参数、诊断展示 |
| 大纲工作台 | 上下文、Agent 参数、诊断展示 |
| 设置页只读 | 无编辑入口、打开文件夹可用 |

### 文档回写

1. `_audit/神意开发经验总结_v2.md`
   - Folder 测试必须走真实执行器。
   - 模式边界必须先透明再优化。
   - 第三方协议优先使用可移植默认值，不依赖本地 Agent ID。
2. `_audit/DEV_LOG_MASTER_INDEX.md` 追加本阶段记录。
3. 新增对应 DEV_LOG。

### 收尾要求

- 清理临时脚本和测试技能。
- 结束源 Electron。
- 不升级版本号、不封装，除非你另行确认。

---

## 风险与对策

| 风险 | 影响 | 对策 |
|---|---|---|
| 测试按钮改动影响文本 SKILL | 高 | Folder 分支独立，不改文本路径 |
| 边界提示过多造成噪音 | 中 | 只在包含 Folder SKILL 且能力失效时提示 |
| `meta.agent` 与本地绑定冲突 | 中 | 明确优先级并写入规范 |
| 批量导入部分失败 | 中 | 逐项结果汇总，不静默跳过 |
| 诊断面板挤压 UI | 中 | 默认折叠，展开区域固定最大高度 |
| 诊断展示接入面广 | 中 | 先组件化，再逐入口接入并单独验证 |

## 执行顺序建议

1. Phase 1：测试可信。
2. Phase 2：边界透明。
3. Phase 3：规范与校验器。
4. Phase 4：子技能 Agent 协议。
5. Phase 5：批量导入。
6. Phase 6：统一诊断。
7. Phase 7：总回归。

Phase 1 和 Phase 2 是 P0，建议连续执行；Phase 3 之后可以在每个阶段结束后暂停给你验收。
