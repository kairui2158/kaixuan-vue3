# Folder SKILL meta.json 磁盘声明规范（2026-11-01）

## 最高优先警告

1. 自技能/智能导入链路收口（3.110.11 起）后，folder SKILL 磁盘包是执行期唯一权威源。流水线、大纲工作台、主页共创在执行前都会重新读取磁盘 `meta.json`；store/UI 里的旧快照只负责首屏渲染，不再能替 SKILL 决定执行语义。
2. `intents` 与 `contextPolicy` 缺失不是 API 错误，也不会阻断生成；运行时会把缺失字段清空并退回应用默认上下文策略，同时在 API 进度条显示“文件夹磁盘声明缺失”。这属于设计内观测，不是供应商故障。
3. 2026-11-01 对账结论：该警告的直接缺口是各层 folder SKILL 的 `meta.json` 未声明这两个字段；根因是应用切换磁盘权威源时，没有把新的声明合同写进给 SKILL 层的适配手册。SKILL 层从未收到声明要求，这轮不属于 SKILL 违规。
4. 从本规范发布起，folder SKILL 元数据缺字段时以本规范为准补齐；禁止依赖导入记录、UI 覆盖或运行时默认兜底来“修 warning”。

## 适用对象

- 所有 folder SKILL：L1 大纲层、L2 设定层、L3 卷纲层、L4 章节层、正文层，以及后续新增层。
- 本规范只新增 `meta.json` 声明要求，不修改已发布的正文契约、候选账本、word-gap、叙事 verdict 语义：
  - [FOLDER_SKILL_BODY_PROTECTED_CONTRACT_GUIDE_2026-10-30.md](FOLDER_SKILL_BODY_PROTECTED_CONTRACT_GUIDE_2026-10-30.md)
  - [SKILL_NARRATIVE_VERDICT_HANDOFF_2026-10-31.md](SKILL_NARRATIVE_VERDICT_HANDOFF_2026-10-31.md)

## 为什么必须显式声明

应用在 3.110.11/3.110.12 做了两个语义决定：

1. **磁盘是权威源。** 运行时水合会读取磁盘 `template/meta/intents/contextPolicy`。磁盘缺失字段会被清空，而不是沿用 store 或 UI 里保存过的旧值。
2. **体检与运行时同口径报警。** 技能体检会在导入/体检面板报 `meta.intents` 与 `meta.contextPolicy` warning；运行 API 时进度条报“文件夹磁盘声明缺失”。

如果 SKILL 不声明，应用不会拒绝执行，而是替 SKILL 采用默认上下文策略。结果有两个：

- 每次生成都会持续出现“文件夹磁盘声明缺失”，trace 带长期噪音。
- 上下文策略变成隐式约定：SKILL 层无法控制是否携带大纲、记忆、聊天历史，后续任何默认值变化都会静默改变 SKILL 的实际输入。

显式声明的价值不是“消除提示”，而是把 SKILL 的上下文合同固定在磁盘包里：谁部署、谁导入、谁覆盖，执行语义都一致。

## 字段声明清单

### 必填

| 字段 | 类型 | 合法值 | 缺失后果 |
|---|---|---|---|
| `intents` | 字符串数组 | 每项必须是字符串，建议使用小写英文语义词 | 体检报 warning：`未声明可解析的 intents，技能用途不完整`；运行时清空用途声明 |
| `contextPolicy` | 对象 | 必须是 JSON 对象（不能是数组/字符串） | 体检报 warning：`contextPolicy 缺失或不是对象，运行时将退回默认上下文`；运行时清空策略并退回默认值 |

### `contextPolicy` 子字段

| 子字段 | 类型 | 合法值 | 语义 |
|---|---|---|---|
| `chatHistory` | 字符串 | `none` / `recent` / `summary` / `full` | 聊天历史注入模式。`latest`、`all` 是旧语义，体检报 error 并阻断健康状态 |
| `includeOutline` | 布尔 | `true` / `false` | 是否允许应用额外注入大纲全文。模板已通过 `{{outlineContent}}` 自行注入大纲时，可设 `false`，避免同一全文重复进入上下文 |
| `includeMemory` | 布尔 | `true` / `false` | 是否注入项目记忆 |
| `recentTurns` | 数字 | 建议仅在 `chatHistory: "recent"` 且需要覆盖默认值时声明 | 近期对话轮数；应用默认 10 轮。磁盘包不声明时沿用应用默认值，不在体检中报错 |

### 既有声明字段（不属于本规范新增，但同在 meta.json 单源维护）

| 字段 | 语义 | 备注 |
|---|---|---|
| `sampleCount` / `smartSamples` | 样本注入数量与智能截断开关 | 正文层现行配置：`sampleCount: 5`、`smartSamples: false` |
| `deai` | 正文层内嵌降AI契约 | 详见正文层适配手册；`finalStepDetection: off` 已有真实消费点与关断测试 |
| `chainHandoff` | 链式交付声明 | 需要完整上游上下文的步骤必须声明 `requiresFullUpstreamContext` 与 `reason` |

## 各层建议值

建议值按层职责给出；SKILL 侧可按模板实际需要调整，但任何一层都必须显式声明 `intents` 与 `contextPolicy`，缺省值不再由应用替 SKILL 猜。

| 层 | `intents` 建议 | `contextPolicy` 建议 | 依据 |
|---|---|---|---|
| L1 大纲层 | `["outline", "generate"]` | `{ "chatHistory": "recent", "includeOutline": true }` | 大纲共创需要参考用户近期意图，并读取当前大纲全文 |
| L2 设定层 | `["analyze", "generate"]` | `{ "chatHistory": "recent", "includeOutline": true }` | 设定提取需要用户意图与大纲上下文 |
| L3 卷纲层 | `["generate"]` | `{ "chatHistory": "none", "includeOutline": true }` | 卷纲链以当前卷任务包为事实源；用户聊天不应改变卷事实 |
| L4 章节层 | `["generate"]` | `{ "chatHistory": "none", "includeOutline": true }` | 章节规划以卷纲与章节任务包为事实源；闲聊历史不参与章位规划 |
| 正文层 | `["generate"]` | `{ "chatHistory": "none", "includeOutline": true }` | 正文生成以骨架、交接、受保护契约为事实源；`includeOutline` 只在正文层模板未显式携带必需大纲节选时开启 |

注意：`includeOutline: false` 只关闭“应用额外注入的大纲上下文包”；模板变量 `{{outlineContent}}` 是 SKILL 自己的模板行为，不受该开关影响。若模板已经写了 `{{outlineContent}}`，再设 `includeOutline: true` 可能造成同一大纲全文重复注入，S1 这类解析步尤其要检查。

## 最小完整示例

```json
{
  "sampleCount": 5,
  "smartSamples": false,
  "intents": ["generate"],
  "contextPolicy": {
    "chatHistory": "none",
    "includeOutline": true
  },
  "chainHandoff": {
    "requiresFullUpstreamContext": true,
    "reason": "本步骤需要完整上游闭包，避免在既有事实上漂移。"
  },
  "deai": {
    "contractVersion": 1,
    "generation": "on",
    "finalStepDetection": "on",
    "conflictPolicy": "report"
  }
}
```

示例包含正文层现行字段。其他层没有 `deai` 声明时删除该块；不需要完整上游上下文的步骤删除 `chainHandoff`，不要复制“完整示例”制造无意义声明。

## 体检与运行时判定矩阵

| meta.json 状态 | 技能体检 | API 运行 | 是否阻断 |
|---|---|---|---|
| 声明完整且合法 | 无该字段 warning | 无“文件夹磁盘声明缺失” | 否 |
| 缺 `intents` | warning：`meta.intents` | 进度条警告 `intents` 缺失 | 否 |
| 缺 `contextPolicy` | warning：`meta.contextPolicy` | 进度条警告 `contextPolicy` 缺失 | 否 |
| `contextPolicy: "recent"` 或数组 | warning：`meta.contextPolicy` | 运行时按缺失清空 | 否 |
| `chatHistory: "latest"` 或 `"all"` | error：`chatHistory 非法` | 运行时无法作为合法策略消费 | 体检健康状态为不健康 |
| `includeOutline: "yes"` | error：`includeOutline 必须是布尔值` | 运行时无法作为合法策略消费 | 体检健康状态为不健康 |

## SKILL 层更新步骤

1. 打开该层每个步骤目录的 `meta.json`。
2. 补上 `intents` 与 `contextPolicy`，按“各层建议值”选择；模板确有特殊需要时自行调整合法值。
3. 保留既有 `sampleCount`、`smartSamples`、`deai`、`chainHandoff` 等声明，不因补新字段删除旧合同。
4. 用 JSON 校验确认文件可解析：任何语法错误都会让运行时落入 `folder-hydration-load-failed`，比字段缺失更严重。
5. 更新后在应用“设置 → 技能”体检该技能：应不再出现 `meta.intents` 与 `meta.contextPolicy` warning。
6. 重新执行一次对应层生成：API 进度条不应再显示“文件夹磁盘声明缺失”。

## 禁止事项

- 禁止把 `intents` 或 `contextPolicy` 写进 `template.md` 或 `SKILL.md` 后就当作已声明；执行期只读 `meta.json`。
- 禁止使用 `latest`、`all` 旧语义；持久化/配置导入面会迁移旧值，但磁盘包内旧值会被体检报 error。
- 禁止用 UI 覆盖、导入记录或 store 快照“修 warning”；运行时每次都会重新读磁盘并清空缺失字段。
- 禁止为了消 warning 把 `contextPolicy` 声明为无意义对象（例如空对象）而不写子字段；空对象等于没有策略，仍然依赖应用默认值。

## 排查与对账命令

```powershell
rg -n "intents|contextPolicy" src/services/folderSkillRuntimeHydration.ts src/services/realSkillLoader.ts src/services/skillHealth.ts
```

应看到运行时读取、水合、清空诊断与体检口径使用同一字段名。

```powershell
rg -n "intents|contextPolicy" "D:\codex\玄武规划SKILL\<层目录>\*\meta.json"
```

用于确认目标层每个步骤的磁盘声明是否齐全。

## 实现锚点

- `src/services/folderSkillRuntimeHydration.ts:60-90`：执行期统一水合磁盘 `template/meta/intents/contextPolicy`，缺失字段清空并写 `folder-hydration-field-cleared`。
- `src/services/realSkillLoader.ts:155-193`：磁盘元数据单源加载器，解析 `intents` 与 `contextPolicy`。
- `src/services/skillHealth.ts:126-142`：体检对缺声明报 warning，对非法 `chatHistory/includeOutline` 报 error。
- `src/services/skillIdentity.ts:1-55`：`chatHistory` 合法值单源，以及 `latest/all` 旧语义迁移边界。
- `src/components/pipeline/PipelinePanel.vue:2505-2514`：API 进度条“文件夹磁盘声明缺失”文案来源。

## 责任归属结论

- 2026-10-31 前：应用手册从未要求声明 `intents/contextPolicy`，SKILL 层按当时手册交付，无责任。
- 2026-11-01 起：本规范是明确合同。SKILL 层更新后仍缺失或使用非法值，责任在 SKILL 层。
- 应用侧：负责保持运行时、体检、本规范三方字段与口径一致；本规范随实现语义变化必须同批更新。
