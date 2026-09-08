# 真 SKILL 双方案融合执行计划

> 生成日期：2026-09-07  
> 状态：待用户审核，未执行任何应用源码改动  
> 底座定稿：`_audit/REAL_SKILL_PLAN_SUPPLEMENTED.md`（G1-G8 补全方案）  
> 升级定稿：`_audit/REAL_SKILL_UPGRADE_FINAL.md`（U1-U5 五线升级方案）  
> 执行纪律：`_audit/神意开发经验总结_v3.md`  
> 当前版本基线：`package.json` version = 3.27.0

---

## 0. 审核摘要

本计划是两份定稿的融合执行版，不推翻任何一份定稿。执行原则只有一条：

> 底座方案是铁律，升级方案是施工蓝本；技术实现融合成一条依赖链，验收按阶段分门。

融合后的执行结构：

```text
Phase 0 基线与保护门
  -> Phase 1 文件协议与持久化底座
  -> Phase 2 单 SKILL 执行核心
  -> Phase 3 三条消费路径接入
  -> Phase 4 单 SKILL 升级线 U1/U2/U3/U5
  -> Phase 5 组合编排 U4
  -> Phase 6 全量回归、文档回写、用户实操验收
```

每个 Phase 都有硬验收门。前一阶段未闭环，禁止进入下一阶段；需要用户决策时，暂停目标模式等待用户，不允许被目标推进绕过。

---

## 1. 融合原则

| 编号 | 原则 | 来源 | 融合结果 |
|------|------|------|----------|
| F1 | `format=text` 默认行为不变 | 底座 B1 | 所有新能力只存在于 folder 路径 |
| F2 | 三条消费路径全覆盖 | 底座 G1 | 去AI味、生成流水线、主页共创全部接入 |
| F3 | 统一路由，禁止三处复制 | 升级 C4 | 新增 `skillRouter`，三个调用方只调 router |
| F4 | Agent 参数必须真实进入请求 | 底座 B3 | router/executor 统一传递 systemPrompt、temperature、maxTokens、model |
| F5 | 持久化全链路不断裂 | 底座 B4 | store、JSON 导入导出、Markdown 导入导出、重启恢复全覆盖 |
| F6 | 失败必须可见，不允许伪装成功 | 升级 C6 | failed / skipped / fallback / degraded 全部落日志和 UI |
| F7 | API 调用受预算控制 | 升级 C3 | 全局预算 + 单 SKILL 限额 + 调用日志 |
| F8 | 不新增依赖，不动核心链路 | 底座 B7/B8 | 不修改清单见 §10 |
| F9 | 升级能力默认关闭 | 升级 C7 | U1-U5 只有 meta 显式声明才启用 |
| F10 | 用户决策点优先于目标推进 | 用户铁律 | 决策未确认时暂停，不推进、不猜默认 |

---

## 2. 双方案冲突对账表

这是本次融合执行的核心防错表。两份方案有两处表面冲突，必须在计划里裁决，不允许执行时临场发挥。

| 冲突点 | 底座方案写法 | 升级方案写法 | 融合裁决 |
|--------|--------------|--------------|----------|
| 路由实现方式 | PipelinePanel/ChatPanel 内直接写 folder 分支 | 统一 `skillRouter` 避免三处复制 | 采用 router。底座示例只是说明覆盖目标，不是要求在组件里复制逻辑。三处调用方只做：取 skill -> 调 router -> 消费统一结果 |
| 执行器职责 | realSkillExecutor 直接承担单 SKILL 执行 | executor 只管单 SKILL，orchestrator 管 composite | 按升级方案分层。Phase 2 只落 executor；Phase 5 才落 orchestrator，executor 不承担跨 SKILL 编排 |
| Agent 注入位置 | useDeAi 的 callAiApi 增加 agent 参数；executor 也传 agent | router/executor 统一传 Agent 参数 | 两个都做：useDeAi 文本路径保留 agent 参数扩展；folder 路径由 executor 统一传。注入顺序统一为 Agent systemPrompt -> SKILL template |
| 进度展示 | 未定义统一进度 | 复用现有统一进度组件，不新增弹窗体系 | 复用 GenerationProgressBar / LOG_CONTAINER_IDS / deAiStore.updateProgress，router 发事件，调用方映射到自己的日志数组 |
| 验证矩阵 | V1-V12 | V1-V16 | 合并为一份 V1-V16，按 Phase 分配，见 §12 |
| 步骤编号 | 底座 11 步 | 升级 S1-S14 | 不沿用两套编号。本文档使用 F-Step 编号，映射关系见 §11 |

---

## 3. Phase 0：基线与保护门

**目标：** 在改第一行源码之前，把当前脏工作区、测试夹具、影响圈、验证基线全部固定下来。

### F0.1 读档与影响圈声明

动作：

1. 读取 `神意开发经验总结_v3.md` 全文，重点核对 §1、§2、§3、§7、§9。
2. 读取两份定稿方案。
3. 用 `rg` 输出以下影响圈清单，保存到执行台账：
   - `skillStore.getSkill` 全部调用点
   - `useDeAi` 三个 process 函数
   - PipelinePanel 3 处 `getSkill` 调用
   - ChatPanel `selectedCoCreationSkills` 和 `runHomeCoCreationSkills`
   - `skill.ts` 的 load/save/import/export
   - `markdown.ts` 的 parse/serialize
   - `GenerationProgressBar` 和 `LOG_CONTAINER_IDS` 消费关系

产出：`_audit/REAL_SKILL_FUSION_EXECUTION_LEDGER.md`，包含影响圈、基线证据、每步验证记录。

验收：

- [ ] 影响圈清单包含上述全部搜索项和行号。
- [ ] 台账文件创建成功。
- [ ] 未修改任何源码。

### F0.2 脏工作区保护

当前工作区存在大量历史未提交改动。执行规则：

1. 保存 `git status --short` 快照到 `_audit/tmp/real-skill-fusion-baseline-status.txt`。
2. 只允许触碰 §11 步骤表列出的文件。
3. 不清理、不回滚、不格式化任何用户或历史改动。
4. 每个 Phase 结束做 `git diff -- <本阶段文件>` 自审，超出需求范围的行必须当场剔除或说明。
5. 不创建分支、不提交 commit，除非用户在执行期明确要求。

验收：

- [ ] 基线快照存在。
- [ ] 每阶段 diff 只包含计划内文件。

### F0.3 测试夹具准备

创建只读测试夹具目录（不属于应用源码，不打包）：

```text
_audit/tmp/real-skill-fixtures/
  text-skill-baseline/
  folder-minimal/          SKILL.md + template.md
  folder-full/             SKILL.md + template.md + meta.json + script.js + samples.txt + schema.json
  folder-broken-path/      仅 store 记录，不创建真实目录
  folder-bad-script/       script.js 故意语法错误
  folder-multi-pass/       meta executionMode=multi-pass
  folder-retry/            postProcess 恒返回 valid=false
  folder-composite/        children/ 三个子 SKILL
```

验收：

- [ ] 夹具全部创建。
- [ ] 夹具内容可被脚本读取，路径均为仓库内相对路径。
- [ ] 不触碰 `_data` 用户真实数据；需要 store 注入时使用探针内临时对象，finally 恢复。

### F0.4 验证基线

在改码前执行并记录：

```powershell
npm run type-check
npm run build:vue
```

注意：`build:vue` 已按经验规则保证主构建在 protocols 构建之前，禁止拆开单独先跑 protocols 构建。

验收：

- [ ] 两条命令输出已保存到台账。
- [ ] 若基线本身失败，先记录为既有问题，禁止把基线失败混入本任务回归。

---

## 4. Phase 1：文件协议与持久化底座

**目标：** folder SKILL 能被识别、导入、保存、重启恢复，且不破坏现有文本 SKILL。

### F1.1 Electron IPC 加载器

新增 `electron/ipc/skill-loader.js`：

职责：

1. `skillLoadFolder(folderPath)`：读取 `SKILL.md`、`template.md`、`meta.json`、`script.js`、`samples.txt`、`schema.json`。
2. `skillListFolders(rootPath)`：列出可选 SKILL 文件夹。
3. `skillExecuteScript(script, payload)`：Node `vm` 沙箱执行，5 秒超时。
4. 沙箱禁止 `require/fs/process/__dirname`，只暴露受限 `api`。
5. `template.md` 缺失返回错误；其他可选文件缺失返回空值。
6. 所有路径必须存在且在用户选择的目录内，路径不存在返回结构化错误，不抛未知异常。

修改 `electron/preload.js`：暴露上述三个方法。

修改 `electron/main.js`：只允许新增一行 require / register 调用。

验证：

- [ ] Node 侧直接调用 IPC handler，返回结构正确。
- [ ] `require('fs')` 脚本被拦截且不崩溃。
- [ ] 超时脚本 5 秒被终止。

### F1.2 Skill 类型与持久化

修改 `src/stores/skill.ts`：

1. `Skill` 接口增加：

```typescript
format?: 'text' | 'folder'
folderPath?: string
```

2. `loadSkills()` 手动映射表补：

```typescript
format: s.format || 'text',
folderPath: s.folderPath || '',
```

3. `importFromJSON()` push 对象补同字段。
4. `importSkills()` 新增 push 对象补同字段；overwrite 已由 `Object.assign` 覆盖，但需测试确认。
5. 不改 `saveSkills()` 深拷贝逻辑。
6. 不引入任何 `saveConfig` 重新赋值模式。

验证：

- [ ] 导入 folder skill 后写盘，`wa_skills` 中包含 `format=folder` 与 `folderPath`。
- [ ] 等待异步写盘完成后再读盘，不以点击保存当持久化证据。
- [ ] 重启源 Electron 后字段仍在。
- [ ] 存量 text skill 读取后仍为 `format=text` 或缺省等价行为。

### F1.3 JSON/Markdown 导入导出兼容

修改 `src/services/configExchange/markdown.ts`：

1. `parseSkillMd` 支持 `format`、`folderPath` 字段。
2. `serializeSkillMd` 输出这两个字段。
3. YAML 无 `schema` 时维持现有 warning 兼容行为，不新增拦截。

同步确认 `toSkillRecord` 是否白名单过滤；若是，把新字段加入白名单。

验证：

- [ ] folder skill 导出 Markdown 后字段存在。
- [ ] 该 Markdown 重新导入后字段恢复。
- [ ] 普通无 front matter Markdown 仍走现有兼容导入，不报新错误。
- [ ] 缺 `schema` 的半标准 Markdown 仍显示 warning 且可继续。

### F1.4 设置页基础管理 UI

修改 `src/components/settings/SkillSettings.vue`：

1. 新增“导入文件夹 SKILL”入口，调用系统目录选择。
2. 卡片显示：
   - folder/text 类型标识
   - folderPath
   - 路径状态：有效 / 失效
   - 失效时显示“重新选择文件夹”
3. 能力标签（multi-pass、retry、composite）在 Phase 4/5 再加，本阶段只显示基础类型。
4. 样式只使用 tokens.css 变量和共享间距类，不硬编码颜色间距。

验证：

- [ ] 导入 `folder-minimal` 后卡片出现。
- [ ] 重命名夹具目录后状态变失效。
- [ ] 点击重新选择可恢复。
- [ ] 卡片无文字溢出、无遮挡。

### Phase 1 验收门

对应 V2、V12 的一部分。必须满足：

- [ ] `npm run type-check` 通过。
- [ ] `npm run build:vue` 通过。
- [ ] 源 Electron 启动后设置页真实导入 folder skill 成功。
- [ ] 重启后 folder skill 仍在。
- [ ] text skill 列表和导入导出行为不变。
- [ ] 台账记录截图/JSON 日志/命令输出中的至少一种证据。

---

## 5. Phase 2：单 SKILL 执行核心

**目标：** 一个 folder SKILL 能完整执行 preProcess -> API -> postProcess，并带 fallback、样本优先级、Agent 参数注入。

### F2.1 渲染层加载器

新增 `src/services/realSkillLoader.ts`：

1. `loadRealSkill(folderPath)` 调 IPC。
2. 成功后缓存，按 mtime 失效。
3. 失败返回 `null`，由调用方决定 fallback。
4. 子 SKILL 延迟加载，Phase 5 才消费。

### F2.2 全局 API 预算

新增 `src/services/apiCallBudget.ts`：

1. 每次执行创建 budget 实例。
2. 默认总预算 8 次 API 调用。
3. 单 SKILL 可用 `meta.apiCallLimit` 进一步限制。
4. 超限返回 `BLOCKED`，并输出已用次数、超限位置。
5. 每次调用写入执行日志，不写用户项目数据。

### F2.3 执行器基础版

新增 `src/services/realSkillExecutor.ts`，本阶段只实现 single pass：

执行流程：

```text
load package
  -> run preProcess
  -> normalize result
  -> assemble messages
  -> call aiService.callAi
  -> run postProcess
  -> normalize result
  -> return output + status + diagnostics
```

必须实现：

1. `PreProcessResult` / `PostProcessResult` 归一化：`undefined` -> `{}`，`string` -> `{input}` 或 `{output}`，object 白名单拷贝，未知字段记 warning。
2. Agent 注入顺序：`Agent systemPrompt -> SKILL template`。
3. Agent 参数传递：`temperature/maxTokens/model` 全部进入 `aiService.callAi`。
4. 样本优先级：SKILL `samples.txt` 优先，缺失回退 `deai-samples.js`，默认 3 条。
5. 样本注入位置：user message 顶部 `[style reference]`。
6. fallback 表：

| 场景 | 行为 | 状态 |
|------|------|------|
| folderPath 失效 | 返回 fallback 信号，调用方走文本模板 | fallback |
| template.md 缺失 | 返回错误，不调用 API | failed |
| script 语法错误 | 跳过钩子，继续执行 | degraded |
| preProcess 抛错 | 使用原始输入 | degraded |
| postProcess 抛错 | 使用 API 原输出 | degraded |
| 沙箱超时 | 跳过脚本 | degraded |
| API 失败 | 走 aiService retry，最终失败则 failed | failed |
| 样本加载失败 | 静默跳过样本 | degraded |

7. 返回结构包含 `status`、`output`、`errors`、`diagnostics`、`fromCache`，不允许只有字符串。

### F2.4 useDeAi 接入

修改 `src/composables/useDeAi.ts`：

1. `callAiApi` 增加 agent 参数，传递 systemPrompt、temperature、maxTokens、model。
2. `processChain/processSplitMerge/processMultiStep` 取 skill 后先判断 folder，folder 走统一 router。
3. text 路径保持现有逻辑和提示词不变。
4. deAiStore 进度文案按执行状态更新，不新增弹窗。

### Phase 2 验收门

对应 V1、V3-V9、V12 完整闭环：

- [ ] text skill 输出与基线一致。
- [ ] folder-minimal 可执行并输出。
- [ ] preProcess 修改输入可从请求日志证明。
- [ ] postProcess 修改输出可从最终结果证明。
- [ ] SKILL 自带样本优先。
- [ ] 无 samples.txt 时回退全局样本。
- [ ] 沙箱 require 被拦截。
- [ ] 路径失效时回退文本路径并提示。
- [ ] Agent temperature/maxTokens/model 出现在请求参数记录中。
- [ ] type-check、build:vue 通过。

---

## 6. Phase 3：三条消费路径接入

**目标：** 去AI味、生成流水线、主页共创全部通过同一个 router 消费 folder SKILL。

### F3.1 统一路由

新增 `src/services/skillRouter.ts`：

```text
routeSkill(skill, input, context, options)
  -> text: 返回 text 模式信号，由调用方走原路径
  -> folder: load -> execute -> 返回统一结果
  -> 失效: 返回 fallback 信号 + 诊断
```

router 不直接操作 Pinia store，不写项目数据，不弹 UI；只返回状态和诊断，由调用方决定展示方式。

### F3.2 生成流水线接入

修改 `src/components/pipeline/PipelinePanel.vue`：

1. 3 处 `getSkill` 调用点接入 router：约 L1435、L1469、L3057。
2. folder 结果进入原有下一步数据流，不改变 chain/compose 语义。
3. Agent 参数沿用流水线现有 per-step Agent 解析，并传入 router。
4. 执行状态映射到现有内联进度条与日志数组，不新增弹窗。

### F3.3 主页共创接入

修改 `src/components/chat/ChatPanel.vue`：

1. `selectedCoCreationSkills.length > 0` 分支接入 router。
2. folder SKILL 结果进入现有消息流。
3. 共创 Agent 的 systemPrompt、temperature、maxTokens、model 传入 router。
4. 保留现有工具调用、编辑批次、上下文记忆逻辑；folder 分支不绕过安全审批。

### F3.4 去AI味最终统一

修改 `src/composables/useDeAi.ts`：

1. Phase 2 的临时直接调用改为 router。
2. 三条路径共用同一个 fallback 判定。

### Phase 3 验收门

对应 V8、V10、V11：

- [ ] 文本 + folder 混合链完成执行，路由记录正确。
- [ ] folder SKILL 加入流水线后 pre/post 生效。
- [ ] folder SKILL 在主页共创执行成功。
- [ ] 共创请求记录包含 Agent 参数。
- [ ] 流水线和共创不新增阻断式弹窗。
- [ ] 现有工具调用、编辑批次、续生成不回归。

---

## 7. Phase 4：单 SKILL 升级线 U1/U2/U3/U5

**目标：** 在已经稳定的 executor 上叠加动态模板、多轮执行、Schema 重试、样本智能选择。

### F4.1 U1 动态模板

修改 `realSkillExecutor.ts`：

1. preProcess 返回 `template` 或调用 `api.setTemplate(text)` 时覆盖本轮模板。
2. 只影响当次执行，不写回文件。
3. 覆盖长度上限 20000 字符，超限截断并记 warning。
4. 诊断日志记录“模板被动态覆盖”。

### F4.2 U2 multi-pass

1. 仅 `meta.executionMode === "multi-pass"` 启用。
2. `passes` 最大 5 个。
3. 每个 pass 支持 `original` / `previous` 输入。
4. pass 状态：planned / running / done / failed / skipped。
5. 当前 pass 失败即停止后续，不允许拿旧输出伪装成功。
6. 进度事件 `real-skill:pass` 映射到现有进度组件。

### F4.3 U3 Schema 驱动重试

1. 校验优先级：`postProcess` 返回值 -> `schema.json` -> 无校验不重试。
2. 默认总尝试 3 次，受全局预算约束。
3. 第二次注入结构化反馈，第三次温度 `min(agentTemp + 0.05, 1.0)`。
4. 达到上限输出最后结果 + `degraded` 状态 + 校验报告。
5. 每次失败必须进执行日志。

### F4.4 U5 样本智能选择

1. `api.getSamples({ keyword, limit })` 本地打分，不调用 API。
2. 默认 3 条，上限 5 条，总字符预算 4000。
3. 同分保持原顺序，保证稳定。
4. 不改变“SKILL samples.txt 优先于全局样本”的底座规则。

### F4.5 设置页能力标签

修改 `SkillSettings.vue`：

1. 显示 multi-pass / retry / dynamic template / smart samples 标签。
2. 标签只读，不做配置编辑器，避免本阶段范围膨胀。

### Phase 4 验收门

对应 V13-V15：

- [ ] 动态模板进入 system message，且日志可证明。
- [ ] multi-pass 按顺序执行并显示“第 N/M 步”。
- [ ] 失败重试最多到上限，最终状态不是静默成功。
- [ ] 样本选择按关键词变化，且数量/字符预算生效。
- [ ] 未开启升级能力的 folder SKILL 行为仍与 Phase 3 一致。

---

## 8. Phase 5：组合编排 U4

**目标：** composite SKILL 能编排多个子 SKILL，并保持预算、状态、失败可见。

### F5.1 Orchestrator

新增 `src/services/skillOrchestrator.ts`：

1. 父 SKILL `plan` 返回 `{ order, mode }`。
2. `afterStep` 返回 continue / retry / skip / stop。
3. 嵌套深度最多 2 层，循环依赖检测。
4. 父 SKILL 不直接调 API，只编排。
5. 子 SKILL 加载失败整组 BLOCKED。

### F5.2 状态模型

| 内部状态 | UI 中文 |
|----------|---------|
| DONE | 完成 |
| DONE_WITH_CONCERNS | 完成（有警告） |
| NEEDS_CONTEXT | 需要补充信息 |
| BLOCKED | 已阻断 |

### F5.3 UI 呈现

1. 复用现有进度条展开区显示子步骤列表。
2. 每个子步骤显示名称和状态。
3. 不新增弹窗体系。

### Phase 5 验收门

对应 V16：

- [ ] 三子 SKILL 顺序执行。
- [ ] retry/skip/stop 三种 action 各验证一次。
- [ ] 嵌套超限被 BLOCKED。
- [ ] 预算耗尽被 BLOCKED 且日志显示已用次数。
- [ ] 子 SKILL 失败不会伪装成完成。

---

## 9. Phase 6：全量回归、文档回写、用户验收

### F6.1 代码级回归

执行顺序固定：

```powershell
npm run type-check
npm run build:vue
npm run test:services
```

说明：

- 构建成功只是前置条件，不是功能完成。
- 若需要新增 service 单测，测试文件必须与实现同批提交，不允许只改实现不补测试。

### F6.2 源 Electron 真实 UI 验证

启动方式固定：

```powershell
node_modules\electron\dist\electron.exe . --remote-debugging-port=9227
```

要求：

1. 禁止浏览器模式、开发者模式、安装版替代。
2. CDP 探针写成 `.cjs/.mjs` 文件执行，禁止 PowerShell 内联复杂脚本。
3. 探针三段式：前置快照 -> 操作断言 -> finally 恢复清理。
4. 验证 V1-V16，每项记录当轮证据。
5. 若 Electron 33 Runtime/DOM/Page 域假死，按经验规则降级为构建产物扫描 + type-check + vitest + build:vue，并把 UI 验证明确标为“待用户实测”，禁止伪称已验证。

### F6.3 经验与日志回写

1. 更新 `神意开发经验总结_v3.md`，新经验按 §1-§9 归位，禁止尾部追加日期章节。
2. 更新或新增 `DEV_LOG`，说明功能、用途、改动文件、验证证据。
3. 更新 `DEV_LOG_MASTER_INDEX.md` 索引。
4. 保存执行台账为最终验收材料。

### F6.4 用户实操验收

交付用户实测以下路径：

1. 设置页导入 folder SKILL。
2. 重启后确认仍在。
3. 去AI味执行 folder SKILL。
4. 流水线执行 folder SKILL。
5. 主页共创执行 folder SKILL。
6. 观察多轮、重试、组合的状态展示。

只有用户实测通过后，才进入版本号升级和封装讨论。

---

## 10. 不修改清单

以下文件在本任务中禁止修改：

| 文件 | 理由 |
|------|------|
| `src/services/aiService.ts` | executor 直接调用现有 callAi 参数 |
| `src/services/chainExecution.ts` | 文本链 prompt 逻辑不变 |
| `src/services/de-ai.js` | 硬规则层不变 |
| `src/services/deai-samples.js` | 全局样本池不变 |
| `src/services/skillValidation.ts` | 现有文本 SKILL 校验不变 |
| `src/services/chainBreakpoint.ts` | 现有断点逻辑不变 |
| `src/services/agent-scheduler.ts` | Agent 调度容器不变 |
| `src/stores/deai.ts` | 去 AI 味 store 不变 |
| `src/stores/pipeline.ts` | 流水线 store 不变 |
| `src/stores/provider.ts` | 供应商 store 不变 |
| `electron/ipc/storage.js` | 存储层不变 |
| `package.json` | 不新增依赖，版本号不在本任务内改 |

例外：

- `electron/main.js` 只允许新增 skill-loader 的 require/register，不允许其他改动。
- `electron/preload.js` 只允许新增三个 skill API 暴露。

---

## 11. 融合步骤总表

| 步骤 | Phase | 文件 | 类型 | 内容 | 验证 |
|------|-------|------|------|------|------|
| F0.1 | 0 | 台账 | 新增 | 读档与影响圈 | rg 输出入台账 |
| F0.2 | 0 | 台账 | 新增 | 脏工作区快照 | status 快照 |
| F0.3 | 0 | 夹具 | 新增 | 8 类测试夹具 | 文件存在且可读 |
| F0.4 | 0 | - | 验证 | type-check + build 基线 | 命令输出 |
| F1.1 | 1 | electron/ipc/skill-loader.js 等 | 新增/微改 | IPC 加载与沙箱 | handler 直测 |
| F1.2 | 1 | src/stores/skill.ts | 修改 | format/folderPath 持久化 | 重启恢复 |
| F1.3 | 1 | markdown.ts / configExchange | 修改 | 导入导出兼容 | MD 往返 |
| F1.4 | 1 | SkillSettings.vue | 修改 | 基础管理 UI | 真实导入 |
| F2.1 | 2 | realSkillLoader.ts | 新增 | 渲染层加载缓存 | 二次加载不重复 IPC |
| F2.2 | 2 | apiCallBudget.ts | 新增 | 预算 | 超限 BLOCKED |
| F2.3 | 2 | realSkillExecutor.ts | 新增 | single pass 执行 | V3-V9 |
| F2.4 | 2 | useDeAi.ts | 修改 | folder 路由 + Agent 参数 | V1 |
| F3.1 | 3 | skillRouter.ts | 新增 | 统一路由 | 三路径共用 |
| F3.2 | 3 | PipelinePanel.vue | 修改 | 3 处接入 | V10 |
| F3.3 | 3 | ChatPanel.vue | 修改 | 共创接入 | V11 |
| F3.4 | 3 | useDeAi.ts | 修改 | 改调 router | V8 |
| F4.1 | 4 | realSkillExecutor.ts | 修改 | U1 动态模板 | V13 |
| F4.2 | 4 | realSkillExecutor.ts | 修改 | U2 multi-pass | V14 |
| F4.3 | 4 | realSkillExecutor.ts | 修改 | U3 重试 | V15 |
| F4.4 | 4 | realSkillExecutor.ts | 修改 | U5 样本选择 | V15 附带 |
| F4.5 | 4 | SkillSettings.vue | 修改 | 能力标签 | UI 截图 |
| F5.1 | 5 | skillOrchestrator.ts | 新增 | composite 编排 | V16 |
| F5.2 | 5 | 状态模型 | 实现 | 四态状态 | 日志 |
| F5.3 | 5 | 进度 UI | 修改 | 子步骤展示 | 截图 |
| F6.1 | 6 | - | 验证 | 全量代码级回归 | 命令输出 |
| F6.2 | 6 | 探针 | 新增 | V1-V16 UI 验证 | CDP 证据 |
| F6.3 | 6 | 经验/日志 | 修改 | 回写 | 文档 diff |
| F6.4 | 6 | - | 交付 | 用户实操 | 用户确认 |

---

## 12. 合并验证矩阵

| 编号 | 验证项 | Phase | 通过标准 |
|------|--------|-------|----------|
| V1 | text SKILL 不受影响 | 2 | 输出与基线一致 |
| V2 | folder SKILL 加载 | 1 | 卡片显示，路径有效 |
| V3 | folder SKILL 去AI味执行 | 2 | executor 被调用，输出正确 |
| V4 | preProcess 生效 | 2 | API 收到预处理文本 |
| V5 | postProcess 生效 | 2 | 最终输出被后处理 |
| V6 | SKILL 自带样本 | 2 | user message 包含该样本 |
| V7 | 全局样本回退 | 2 | user message 包含全局样本 |
| V8 | 文本+folder 混用 | 3 | 混合链完成，路由正确 |
| V9 | 沙箱安全 | 2 | require 被拦截，不崩溃 |
| V10 | 流水线覆盖 | 3 | pre/post 生效 |
| V11 | 共创覆盖 | 3 | executor 调用，Agent 参数进入请求 |
| V12 | 路径失效回退 | 2 | 回退文本路径并提示 |
| V13 | U1 动态模板 | 4 | system message 使用动态模板 |
| V14 | U2 multi-pass | 4 | 顺序执行，进度可见 |
| V15 | U3 重试 + U5 样本 | 4 | 重试到上限且状态非静默成功 |
| V16 | U4 composite | 5 | 顺序执行，预算受控，状态汇总 |

---

## 13. 用户决策点

以下决策必须在执行前确认。未确认时保持默认值，但不启动执行。

| 决策点 | 默认建议 | 影响 |
|--------|----------|------|
| D1 全局 API 预算 | 8 次 | 过低截断 multi-pass/composite，过高增加成本 |
| D2 U3 总尝试次数 | 3 次 | 失败输出耗时 |
| D3 U2 最大 pass 数 | 5 | 长流程上限 |
| D4 U4 嵌套深度 | 2 层 | 第三方组合复杂度 |
| D5 U5 样本上限 | 5 条 / 4000 字符 | 上下文长度 |
| D6 执行阶段 | Phase 0-3 先行，Phase 4/5 验收后再继续 | 首次双方案融合建议分批验收 |
| D7 夹具位置 | `_audit/tmp/real-skill-fixtures/` | 不进入打包产物 |
| D8 版本升级 | 本任务不升版本；用户实操验收后单独决策 | 避免未验收先封装 |

---

## 14. 风险矩阵

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| 双方案逻辑分叉，三处各写一套 folder 分支 | 高 | F3 强制统一 router，Phase 2 临时路径必须在 Phase 3 改调 router |
| 脏工作区改动污染 | 高 | Phase 0 快照 + 每阶段 diff 自审 + 只触碰步骤表文件 |
| text SKILL 回归 | 高 | V1 基线对比在 Phase 2 前后各跑一次 |
| Agent 参数只在某条路径生效 | 高 | V11 专测共创请求参数，流水线沿用现有链路并记录 |
| API 成本失控 | 高 | 全局预算 + 单 SKILL 限额 + 调用日志 |
| composite 死循环 | 高 | 深度限制 + 循环检测 + 预算阻断 |
| 失败被隐藏 | 高 | 状态模型强制 failed/degraded/BLOCKED 可见 |
| CDP 假死导致假验证 | 中 | 按经验规则降级并如实标注“待用户实测” |
| UI 样式污染 | 中 | 只用 tokens.css 与共享间距类 |
| 存储写盘异步误判 | 中 | 等 IPC promise 完成后读真实 JSON |

---

## 15. 防空转与执行铁律

1. 每个步骤必须以工具调用结束，禁止连续两轮纯文本推进。
2. 连续两次同类工具失败，换执行载体，不重复同一路径。
3. 复杂探针一律落盘 `.cjs/.mjs`，禁止 PowerShell 内联。
4. 每步完成后立即验证，禁止攒到最后统一验。
5. 每个 Phase 结束写台账，未写台账不得进入下一 Phase。
6. 需要用户决策时暂停目标模式，等待用户答复。
7. 不修改清单文件若确需例外，必须先停下向用户申请，不允许顺手改。
8. 构建顺序固定为 `build:vue`，主构建必须先于 protocols 产物。
9. 所有“完成”必须有当轮证据：file:line、命令输出、截图、JSON 日志之一。
10. 用户实操验收前，不升级版本号、不封装。

---

## 16. 完成标准

同时满足以下条件才算完成：

1. V1-V16 全部通过，每项有当轮证据。
2. text SKILL 旧行为零变化。
3. 三条消费路径都能执行 folder SKILL。
4. Agent systemPrompt/temperature/maxTokens/model 在三条路径均真实进入请求。
5. U1-U5 默认关闭，显式配置才启用。
6. 预算、重试、pass、composite 深度限制全部生效。
7. failed/degraded/skipped/BLOCKED 全部在 UI 和日志可见。
8. 持久化、导入导出、重启恢复全链路通过。
9. 经验文件和开发日志完成回写。
10. 用户完成一次真实实操验收。

---

## 17. 当前状态声明

1. 本文档为审核稿，未修改任何应用源码。
2. 本文档只新增计划文件，不触碰当前脏工作区的任何历史改动。
3. 执行必须等待用户明确批准，并从 Phase 0 开始。
4. 若用户选择分批执行，默认建议先执行 Phase 0-3，Phase 4/5 在前三阶段验收后继续。
