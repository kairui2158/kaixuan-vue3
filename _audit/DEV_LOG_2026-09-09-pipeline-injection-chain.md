# 2026-09-09 生成流水线信息注入链路彻查与修复

## 问题背景

客户追问五层流水线（大纲、设定、卷纲、章节、正文）的信息注入链路是否完整。彻查发现设定层、卷纲层、正文层链路完整，但章节层存在两个严重问题：一是 API 调用完全绕过了统一 Skill/Agent 执行通道，二是上游上下文注入不完整。

## 修复内容

### 1. 章节层接入统一执行通道

- `src/components/pipeline/PipelinePanel.vue` 中 `callChapterApi()` 改为调用 `runStepSkills(3, prompt, undefined, fallbackTemplate)`。
- 章节层的智能体选择、Skill 选择、技能模式（compose/chain）、运行日志、API 流式输出全部接入统一通道。

### 2. 章节层补齐上游上下文

原先 prompt 只包含 `[卷纲]`。现在补齐：

- `[全书大纲]`
- `[设定]`
- `[绑定设定]`
- `[风格与节奏]`
- `[卷纲]`

同时新增日志提示：智能体名称、Skill 名称、是否注入风格节奏、卷纲要是否为空警告，方便调试与排查。

### 3. 移除技能错位兜底

- `getStepSkillIds()` 原先在层未配置 Skill 时回退到 `orderedPipelineSkills[step]`，会按数组下标错绑其他层技能。
- 现在未配置即为空，不再跨层兜底。

### 4. 卷数据稳定 ID

- `src/stores/project.ts` 新增 `migrateVolumeIds()`：为缺少 id 的旧卷生成稳定 id，并把以卷名为键的历史章节数据迁移到 id 键下。
- `PipelinePanel.vue` 中 AI 生成卷纲写入前强制补 id。
- 防止卷名变更导致章节数据孤儿化。

### 5. 章节层模板变量修正

- `buildTemplateContext()` 新增 `contextVolumeOverride` 参数。
- 章节层 Skill 模板变量读取当前正在生成的卷，不再误读正文层当前选中卷。

## 验证

- `npm run build` 通过。
- 源应用 `npx electron .` 启动，无渲染错误。

## 影响

- 章节层现在拥有完整上下文链路：大纲 → 设定 → 卷纲 → 章节。
- 章节层智能体/Skill/技能模式配置不再是摆设。
- 旧项目卷数据迁移到稳定 id，避免卷名变更导致章节数据丢失。
- 设定层、卷纲层、正文层原有链路未改动。
