# 真 SKILL 方式 A 实现方案（完整版）

> 生成日期: 2026-09-07  
> 项目: 神意助手 AU3 (Vue 3 + Electron)  
> 状态: 待用户审核，不执行

---

## 一、背景与目标

### 1.1 当前问题

AU3 架构目前的 SKILL 系统是「伪 SKILL」——每个 SKILL 只是一段纯文本提示词（`template` 字段），应用层把这段文本作为 system prompt + 原文作为 user message，一次 API 调用让模型自由发挥。

这导致：
- 模型可以把三步法当建议忽略，只做词汇替换
- 无法强制模型按步骤执行
- 无法在中间步骤做代码级验证
- 无法对同一输入多次采样取最优
- 38 个风格样本如果塞进 SKILL 会导致 prompt 膨胀

### 1.2 目标

引入「真 SKILL」——文件夹形式的 SKILL 包，包含：
- `SKILL.md` 说明书（告诉应用这个 SKILL 做什么、怎么调用）
- `template.md` 指令模板（短，只有改写规则）
- `script.js` 可执行脚本（可选，用于预处理/后处理/验证）
- `samples.txt` 示例范本（可选，风格参考样本）
- `schema.json` 输入输出 Schema（可选）
- `meta.json` 元数据（必须）

应用层通过路由分支决定走「伪 SKILL（纯文本）」还是「真 SKILL（文件夹）」，两条路并存，互不干扰。

### 1.3 设计原则

1. **加法不删法** — 新增文件夹 SKILL 路径，不修改现有伪 SKILL 的任何行为
2. **路由分支隔离** — 在 `getSkillTemplate()` 前面加一个 `if format === 'folder'` 判断，走新路径
3. **沙箱安全** — SKILL 自带脚本在 Node.js `vm` 模块沙箱内执行，不暴露文件系统
4. **应用层掌控注入权** — 风格样本由应用层选择和注入，不进 SKILL 文件
5. **渐进迁移** — 用户可以按需创建文件夹 SKILL，存量文本 SKILL 不受影响

---

## 二、社区调研结论

### 2.1 Codex 自带 SKILL 系统（最佳参考）

读取了 `C:/Users/凯瑞/.codex/skills/.system/` 下的 SKILL 文件夹结构：
- `SKILL.md` — 说明书 + 指令
- `agents/*.yaml` — UI 元数据
- 可选子目录 — 脚本、示例、配置

这是目前最成熟的 SKILL 文件夹规范，我们的真 SKILL 结构对齐 Codex。

### 2.2 沙箱方案对比

| 方案 | 安全性 | 性能 | 复杂度 | 维护状态 | 适用场景 |
|------|--------|------|--------|----------|----------|
| Node.js `vm` 模块 | 中等（不暴露 require/fs） | 高（内置，零依赖） | 低 | Node.js 内置 | 我们的场景 |
| `isolated-vm` | 最高（V8 isolate 堆隔离） | 中（跨 isolate 通信有开销） | 高（原生编译） | 活跃（v7.0.1） | 高安全要求 |
| `vm2` | 高 | 中 | 中 | 已废弃（CVE 多） | 不推荐 |
| `@tanstack/ai-isolate-node` | 最高 | 中 | 高 | 活跃（2026-08） | AI Code Mode |

**结论：用 Node.js 内置 `vm` 模块。**

理由：
1. 我们的 SKILL 脚本不是「不可信代码」——它是用户自己创建的
2. `vm` 模块零依赖、不需要原生编译、不增加打包体积
3. 只需要在沙箱里暴露 `console.log` 和一个受限的 `api` 对象，不暴露 `require`/`fs`/`process`
4. 如果未来安全要求升级，可以无缝替换为 `isolated-vm`，接口设计保持不变

### 2.3 行业趋势

- TanStack AI（2026-08 发布）用 `isolated-vm` 做 AI Code Mode
- Mastra 框架用 `isolated-vm` 做 Agent Code Mode
- Codex 自带 SKILL 系统用文件系统直接读 + Markdown 解析，不用沙箱

我们的方案介于两者之间：SKILL 主要是提示词，但支持可选脚本做预处理/后处理/验证。

---

## 三、真 SKILL 文件夹结构标准

```
skills/
  白虎-S1A-事件核提取-V64/
    SKILL.md          # 说明书：名称、用途、调用方式、输入输出描述
    template.md       # 指令模板：短，只有改写/提取规则（进 system message）
    script.js          # 可选：预处理/后处理/验证脚本（vm 沙箱执行）
    samples.txt        # 可选：风格参考样本（应用层按需注入，不自动塞入）
    schema.json        # 可选：输入输出 JSON Schema
    meta.json          # 元数据：version, author, format, executionMode
```

### 3.1 各文件职责

**SKILL.md（说明书，必须）**

告诉应用这个 SKILL 做什么、怎么调用。包含：名称、用途、输入输出描述、温度建议、依赖关系。

**template.md（指令模板，必须）**

短，只有改写/提取规则，不超过 15 行。进 system message。

**script.js（可选，可执行脚本）**

在 vm 沙箱内执行，暴露的 API：
- `api.log(msg)` — 日志
- `api.getContext()` — 获取调用上下文（step, input, previousOutput）
- `api.setOutput(text)` — 设置输出（覆盖模型输出）
- `api.validate(text)` — 验证文本，返回 {valid, errors}

钩子函数：
- `module.exports.preProcess = function(input, ctx)` — API 调用前处理输入
- `module.exports.postProcess = function(output, ctx)` — API 返回后处理/验证输出

**meta.json（元数据，必须）**

```json
{
  "name": "白虎-S1A-事件核提取-V64",
  "version": "1.0.0",
  "format": "folder",
  "executionMode": "chain",
  "outputFormat": "text",
  "author": "kaixuan",
  "description": "从原文段落提取事件核列表"
}
```

**samples.txt（可选）**

风格参考样本，每行一个样本。应用层按需选择 2-3 个注入，不自动全部塞入。

**schema.json（可选）**

输入输出的 JSON Schema，用于自动验证。

---

## 四、架构设计

### 4.1 路由层设计

```
用户触发去AI味 / 生成流水线
        |
        v
  getSkillTemplate(skillId)
        |
        v
  判断 skill.format === 'folder' ?
     |                    |
    YES                   NO
     |                    |
     v                    v
  realSkillExecutor      现有路径（返回 template 文本）
  (新增模块)              作为 system prompt
     |                    |
     v                    v
  读文件夹              callAiApi(template, input)
  加载 template.md
  加载 script.js (可选)
  执行 preProcess
  调 API (template 作为 system)
  执行 postProcess + 验证
  返回结果
```

### 4.2 新增模块清单

#### 模块1: `electron/ipc/skill-loader.js`（Electron 主进程，新增 ~120行）

**职责：**
- 读取 SKILL 文件夹（SKILL.md, template.md, script.js, meta.json, samples.txt, schema.json）
- 解析 meta.json 获取元数据
- 返回结构化的 SKILL 包给渲染层
- 在 vm 沙箱内执行 script.js

**IPC 通道：**
- `skill:loadFolder` (skillFolderPath) -> 返回 { meta, template, script, samples, schema, readme }
- `skill:listFolders` (skillsRootPath) -> 返回文件夹列表
- `skill:executeScript` (scriptContent, context) -> 在 vm 沙箱内执行脚本，返回结果

**沙箱执行设计：**

```javascript
const vm = require('vm')

function executeScript(scriptContent, context) {
  const sandbox = {
    api: {
      log: function() { /* logging */ },
      getContext: function() { return context },
      setOutput: function(text) { sandbox.__output = text },
      validate: function(text) { return { valid: true, errors: [] } }
    },
    module: { exports: {} },
    exports: {},
    console: { log: function() {} },
    __output: null
  }
  // 不暴露 require, fs, process, __dirname
  vm.createContext(sandbox)
  vm.runInContext(scriptContent, sandbox, { timeout: 5000 })
  return sandbox.module.exports || sandbox.exports || {}
}
```

**安全约束：**
- 沙箱不暴露 `require`、`fs`、`process`、`__dirname`、`__filename`
- 脚本执行超时 5 秒
- 脚本只能通过 `api` 对象与外部通信
- `api` 对象只提供 log/getContext/setOutput/validate

#### 模块2: `electron/preload.js` 新增 IPC 通道（修改现有文件，+12行）

在 `contextBridge.exposeInMainWorld` 内新增 3 个方法：
- `skillLoadFolder(folderPath)`
- `skillListFolders(rootPath)`
- `skillExecuteScript(scriptContent, context)`

#### 模块3: `src/services/realSkillLoader.ts`（渲染层，新增 ~40行）

**职责：**
- 通过 IPC 从主进程加载文件夹 SKILL
- 内存缓存已加载的 SKILL 包（避免重复 IPC）
- 提供 `loadRealSkill(folderPath)` 接口
- 提供 `clearCache()` 接口

#### 模块4: `src/services/realSkillExecutor.ts`（渲染层，新增 ~80行）

**职责：**
- 接收 RealSkillPackage + 输入文本 + 上下文
- 执行 preProcess（如果有脚本）
- 构建 messages（template 进 system message，输入进 user message）
- 调用 aiService.callAi()
- 执行 postProcess + 验证（如果有脚本）
- 返回最终输出

---

## 五、现有代码修改清单

### 修改1: `src/stores/skill.ts`（+2行）

Skill 接口加两个字段：
```typescript
format?: 'text' | 'folder'    // 新增，默认 'text'
folderPath?: string            // 新增，format='folder' 时指向文件夹路径
```

### 修改2: `src/composables/useDeAi.ts`（+25行，3处分支）

加 `isRealSkill()` 判断函数，在 processChain / processSplitMerge / processMultiStep 里每步加分支：
- 文件夹 SKILL -> 走 executeRealSkill()
- 文本 SKILL -> 走现有 getSkillTemplate() + callAiApi()

### 修改3: `src/components/settings/SkillSettings.vue`（+30行）

在模板末尾加「真 SKILL 文件夹管理」区域，支持导入/编辑/加入流水线/移除。

---

## 六、不修改的部分（明确清单）

以下文件完全不动：
- `src/services/aiService.ts` — realSkillExecutor 调用同一个 aiService.callAi()
- `src/services/chainExecution.ts` — 链式 prompt 构建不变
- `src/services/de-ai.js` — 硬规则层不变
- `src/services/deai-samples.js` — 38 个风格样本不变
- `src/services/skillValidation.ts` — schema 验证不变
- `src/services/chainBreakpoint.ts` — 断网续接不变
- `src/services/agent-scheduler.ts` — Agent 调度容器不变
- `src/stores/deai.ts` — 去 AI 味 store 不变
- `src/stores/pipeline.ts` — 流水线 store 不变
- `src/stores/provider.ts` — 供应商 store 不变
- `electron/main.js` — 主进程不变（IPC 注册在 skill-loader.js 里）
- `electron/ipc/storage.js` — 存储不变
- `package.json` — 不新增依赖（vm 模块是 Node.js 内置）

---

## 七、风险分析与缓解

### 7.1 路由层隔离失效

**缓解：** format 字段默认 undefined，所有 undefined 和 'text' 走文本路径。只有 format === 'folder' 且 folderPath 非空时走文件夹路径。realSkillExecutor 入口加防御检查，加载失败回退到文本路径。

### 7.2 vm 沙箱安全

**缓解：** 沙箱不暴露 require/fs/process。脚本超时 5 秒。SKILL 脚本是用户自己创建的。未来可无缝替换为 isolated-vm。

### 7.3 版本兼容

**缓解：** format 字段可选，undefined = 'text'。所有存量 SKILL 自动走文本路径。导入/导出兼容无 format 字段的旧数据。

### 7.4 路径悬空

**缓解：** realSkillLoader 做缓存，加载失败返回错误但不崩溃。SkillSettings.vue 显示文件夹路径，用户可以看到路径是否有效。

### 7.5 性能

**缓解：** realSkillLoader 做内存缓存，同一文件夹只读一次。文件读取在 Electron 主进程，不阻塞渲染层。

### 7.6 链式调用混用

**缓解：** 每步独立判断 format。文本 SKILL 用 getChainSkillPrompt，文件夹 SKILL 用 executeRealSkill。两种 SKILL 可以在同一条链里混用。

---

## 八、执行步骤（给新对话框的施工指引）

| 步骤 | 文件 | 类型 | 预估行数 | 验证方法 |
|------|------|------|----------|----------|
| 1 | electron/ipc/skill-loader.js | 新增 | ~120行 | Electron控制台调用IPC确认返回结构 |
| 2 | electron/preload.js | 修改 | +12行 | 渲染层console确认方法不为undefined |
| 3 | src/services/realSkillLoader.ts | 新增 | ~40行 | mock IPC返回确认缓存生效 |
| 4 | src/services/realSkillExecutor.ts | 新增 | ~80行 | 创建测试SKILL文件夹跑通完整流程 |
| 5 | src/stores/skill.ts | 修改 | +2行 | 现有SKILL正常加载，新建默认text |
| 6 | src/composables/useDeAi.ts | 修改 | +25行 | 文本SKILL走旧路径，文件夹SKILL走新路径 |
| 7 | src/components/settings/SkillSettings.vue | 修改 | +30行 | 设置页显示真SKILL区域，导入/编辑/加入流水线 |
| 8 | 集成验证 | 验证 | - | 8项验证矩阵 |

### 验证矩阵

| 编号 | 验证项 | 方法 | 通过标准 |
|------|--------|------|----------|
| V1 | 文本 SKILL 不受影响 | 配置文本 SKILL 跑去AI味 | 结果与改动前一致 |
| V2 | 文件夹 SKILL 加载 | 导入文件夹 SKILL | 卡片正确显示 |
| V3 | 文件夹 SKILL 执行 | 跑去AI味 | realSkillExecutor 被调用，输出正确 |
| V4 | preProcess 生效 | SKILL 带 script.js | 输入被预处理 |
| V5 | postProcess 生效 | SKILL 带 script.js | 输出被后处理/验证 |
| V6 | 风格样本注入 | SKILL 带 samples.txt | user message 包含样本 |
| V7 | 链式混用 | 文本+文件夹混用 | 链式调用正常完成 |
| V8 | 沙箱安全 | 脚本尝试 require | 被拦截，不崩溃 |

---

## 九、改动量预估

| 模块 | 类型 | 预估行数 |
|------|------|----------|
| electron/ipc/skill-loader.js | 新增 | ~120 行 |
| electron/preload.js | 修改 | +12 行 |
| src/services/realSkillLoader.ts | 新增 | ~40 行 |
| src/services/realSkillExecutor.ts | 新增 | ~80 行 |
| src/stores/skill.ts | 修改 | +2 行 |
| src/composables/useDeAi.ts | 修改 | +25 行 |
| src/components/settings/SkillSettings.vue | 修改 | +30 行 |
| **合计** | | **~309 行** |

---

## 十、与白虎 SKILL 的配合关系

### 10.1 应用层做什么

- 提供文件夹 SKILL 的加载、缓存、执行、沙箱基础设施
- 提供路由分支，让文件夹 SKILL 和文本 SKILL 各走各的路
- 掌控风格样本的注入权（选择几个、注入到哪一步）
- 提供验证框架（preProcess/postProcess/schema）
- 提供进度条和错误反馈

### 10.2 白虎 SKILL 做什么

- 把 S1 拆成 S1A/S1B/S1C 三个文件夹 SKILL
- 每个 SKILL 文件夹包含：SKILL.md + template.md + 可选 script.js
- 白虎负责写 SKILL 内容，应用层负责执行
- 白虎的 script.js 做事件核数量检查、偏转方法轮换检查、首句主语对比等

### 10.3 38 个风格样本放哪里

**放在应用层，不进 SKILL 文件夹。**

理由：38 个样本塞进 SKILL 导致 prompt 膨胀（每次调用多 5700 字）。应用层按段落内容相似度匹配 2-3 个最相关样本，注入到 S1（改写主力），不注入 S2（验证）。

现有 `deai-samples.js` 已经在应用层，保持不变。realSkillExecutor 的 `options.injectSamples` 控制是否注入，`options.sampleCount` 控制注入几个。

---

## 十一、对生成流水线和去AI味三模式的影响

### 11.1 生成流水线

现有流水线 SKILL 全部是文本格式，自动走旧路径。只有用户主动创建文件夹格式 SKILL 并配置到流水线时才走新路径。不需要每次改 SKILL 就做版本更迭——文件夹 SKILL 的 template.md 可以单独编辑。

### 11.2 chain 模式

- 文本 SKILL：走现有 for 循环，不动
- 文件夹 SKILL：每步走 executeRealSkill，带 preProcess/postProcess
- 混用：每步独立判断 format

### 11.3 split-merge 模式

- 文本 SKILL：走现有切分 + Promise.all，不动
- 文件夹 SKILL：每段走 executeRealSkill，带样本注入

### 11.4 multi-step 模式

- S1A/S1B/S1C = 文件夹 SKILL 1/2/3，S2 = 文件夹 SKILL 4
- 每步走 executeRealSkill，带步骤间验证
- 风格样本只注入 S1（改写主力），不注入 S2（验证）

---

## 十二、总结

方式A 对 AU3 架构是一个纯加法操作：
- 新增 4 个模块 + 修改 3 处现有文件
- 不新增 npm 依赖（vm 模块是 Node.js 内置）
- 不破坏任何现有功能（format 默认 'text'，存量 SKILL 自动走旧路径）
- 不改动 aiService / chainExecution / de-ai / deai-samples / skillValidation 等核心模块
- 总改动量约 309 行（新增约 284 行，修改约 25 行）

社区调研结论：Node.js 内置 vm 模块是最佳沙箱方案。Codex 自带 SKILL 系统的文件夹结构是最佳参考标准。

---

*本方案待用户审核通过后交由执行对话框实现。*
