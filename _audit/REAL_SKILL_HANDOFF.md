# 真 SKILL 方式 A - 执行交接文件

> 交接日期: 2026-09-07
> 项目路径: D:/codex/novel-workshop-vue3/
> 方案文档: _audit/REAL_SKILL_IMPLEMENTATION_PLAN.md (完整方案, 必须先读)
> 任务性质: 新功能开发 (纯加法, 不破坏现有功能)

---

## 零、强制前提 (执行前必读)

### 0.1 你是谁、要做什么

你接手的是 [神意助手] AU3 架构 (Vue 3 + Electron + Pinia) 的真 SKILL 升级任务。你的角色是执行者, 方案已经由另一个对话框完成审核, 你只需要按方案执行。

### 0.2 必读文件 (按顺序)

1. 本文件 - _audit/REAL_SKILL_HANDOFF.md
2. 完整方案 - _audit/REAL_SKILL_IMPLEMENTATION_PLAN.md (12 章, 详细设计)
3. 经验文件 - _audit/神意开发经验总结_v3.md (教训记录, 避免重蹈覆辙)
4. 旧架构参考 - C:/Users/凯瑞/Documents/New project 2/ (旧版源码, 用于对照行为)

### 0.3 铁律 (违反任何一条=重来)

1. 先读再改 - 修改任何文件前先读取当前内容, 确认上下文
2. apply_patch 编辑 - 含中文的源文件禁止用 PowerShell Set-Content, 必须用 apply_patch 或 Node.js fs
3. 精准修复 - 禁止批量正则替换, 逐处修复
4. 改完即验 - 每步改完立即 node --check 验证语法, 然后跑功能验证
5. 防空转 - 同一方法连续失败 2 次换路径; 每步写 checkpoint; 连续两轮纯文本=空转信号
6. 不破坏现有功能 - format 默认 text, 所有存量 SKILL 自动走旧路径
7. 不新增 npm 依赖 - vm 模块是 Node.js 内置
8. 截图验证 - 用户模型不支持图片输入, 你必须用 Playwright 或 CDP 自行截图后描述结果

### 0.4 工具可用性自检

调用工具前先确认工具在可用列表中。tool_search 找不到的工具=不存在, 换替代方案。连续两次工具调用失败=停止该路径, 换载体。

### 0.5 脚本编写协议

- 单行简单命令 -> exec_command 直接执行
- 多行脚本/含嵌套引号/JSON -> exec_command 用 Set-Content 写 .js 文件再执行
- 文件编辑 -> apply_patch; apply_patch 格式错误 1 次换 Set-Content 覆盖
- 脚本执行后验证输出, 失败则读完整错误换方案

---

## 一、项目背景

### 1.1 应用是什么

神意助手是一个 AI 驱动的桌面小说写作应用, 基于 Electron + Vue 3 + Pinia。核心功能:
- 生成流水线: 大纲 -> 设定 -> 卷纲 -> 章节 -> 正文, 5 步链式 SKILL 调用
- 去 AI 味: 3 种模式 (chain / split-merge / multi-step), 用 SKILL 重写文本降低 AI 检测率
- 记忆板块: 正文确认后自动提取实体/关系/事件, 用 G6 渲染思维导图
- 聊天面板: 带记忆上下文的 AI 对话

### 1.2 为什么需要真 SKILL

当前 SKILL 是 [伪 SKILL] -- 纯文本提示词 (template 字段), 一次 API 调用让模型自由发挥。问题:
- 模型可以忽略三步法, 只做词汇替换
- 无法在中间步骤做代码级验证
- 无法强制模型按步骤执行

真 SKILL 是文件夹形式, 包含说明书 + 指令模板 + 可选脚本 + 风格样本 + Schema, 应用层代码控制执行流程。

### 1.3 方式A的核心思路

纯加法: 新增文件夹 SKILL 路径, 不修改现有文本 SKILL 的任何行为。通过 format 字段路由:
- format = text (默认) -> 走现有 getSkillTemplate() + callAiApi()
- format = folder -> 走新 executeRealSkill()

两条路并存, 互不干扰。

---

## 二、执行步骤 (严格按顺序)

### 步骤 1: 创建 electron/ipc/skill-loader.js (新增 ~120 行)

文件路径: D:/codex/novel-workshop-vue3/electron/ipc/skill-loader.js

职责:
- 注册 3 个 IPC 通道: skill:loadFolder, skill:listFolders, skill:executeScript
- skill:loadFolder: 读取文件夹内所有文件 (SKILL.md, template.md, script.js, meta.json, samples.txt, schema.json), 返回结构化对象
- skill:executeScript: 用 Node.js vm 模块创建沙箱, 执行脚本, 返回结果

沙箱设计: 创建 sandbox 对象, 暴露 api (log/getContext/setOutput/validate), module, exports, console。不暴露 require/fs/process/__dirname。vm.runInContext 超时 5 秒。

在 electron/main.js 里注册: 加一行 require("./ipc/skill-loader.js") 跟 storage.js 同级方式。

验证: 写测试 SKILL 文件夹, Electron 控制台调用 skillLoadFolder 确认返回结构, 调用 skillExecuteScript 确认沙箱执行, 尝试 require("fs") 确认被拦截。

### 步骤 2: 修改 electron/preload.js (+12 行)

文件路径: D:/codex/novel-workshop-vue3/electron/preload.js

在 contextBridge.exposeInMainWorld 内, 现有 skillExecute 后面加 3 个方法:
- skillLoadFolder(folderPath) -> ipcRenderer.invoke("skill:loadFolder", folderPath)
- skillListFolders(rootPath) -> ipcRenderer.invoke("skill:listFolders", rootPath)
- skillExecuteScript(scriptContent, context) -> ipcRenderer.invoke("skill:executeScript", scriptContent, context)

验证: 渲染层控制台调用 window.electronAPI.skillLoadFolder 确认不是 undefined

### 步骤 3: 创建 src/services/realSkillLoader.ts (新增 ~40 行)

文件路径: D:/codex/novel-workshop-vue3/src/services/realSkillLoader.ts

职责:
- 定义 RealSkillPackage 接口 (meta, template, script, samples, schema, readme)
- 通过 IPC 从主进程加载文件夹 SKILL
- 内存缓存 (Map, 避免重复 IPC)
- 导出 loadRealSkill(folderPath) 和 clearCache()

验证: mock IPC 返回, 确认缓存生效 (第二次调用不触发 IPC)

### 步骤 4: 创建 src/services/realSkillExecutor.ts (新增 ~80 行)

文件路径: D:/codex/novel-workshop-vue3/src/services/realSkillExecutor.ts

职责:
- 接收 RealSkillPackage + 输入文本 + 上下文
- 执行 preProcess (如果 SKILL 带 script.js, 通过 IPC 在沙箱内执行)
- 构建 messages (template 进 system message, 输入进 user message)
- 调用 aiService.callAi() (purpose: rewrite 或 verify)
- 执行 postProcess + 验证 (如果 SKILL 带 script.js)
- 返回 {output, valid, errors, fromCache}

风格样本注入逻辑:
- options.injectSamples === true 时, 从 pkg.samples 取前 N 个 (默认 3)
- 拼接到 user message: [style reference] + samples + --- text --- + input
- 样本不进 system message, 不进 SKILL 文件本身

验证: 创建测试 SKILL 文件夹 (含 script.js 带 preProcess/postProcess), 调用 executeRealSkill() 确认完整流程跑通

### 步骤 5: 修改 src/stores/skill.ts (+2 行)

文件路径: D:/codex/novel-workshop-vue3/src/stores/skill.ts

在 Skill 接口里加两个字段 (在 template 字段后面):
- format?: "text" | "folder"  // 新增, 默认 "text"
- folderPath?: string  // 新增, format="folder" 时指向文件夹路径

影响分析: format = undefined 时当作 "text" 处理, 所有存量 SKILL 零影响。

验证: 现有 SKILL 列表正常加载, 新建 SKILL 默认 text, 手动设置 folder 的能被识别

### 步骤 6: 修改 src/composables/useDeAi.ts (+25 行, 3 处分支)

文件路径: D:/codex/novel-workshop-vue3/src/composables/useDeAi.ts

6.1 加判断函数 (在 getSkillTemplate 前面):
  function isRealSkill(skillId) { return skill?.format === "folder" && !!skill?.folderPath }

6.2 在 processChain 里 S1 调用处加分支 (约第 98 行):
  如果 isRealSkill(skills[0]) 为 true, 走 executeRealSkill(skill.folderPath, text, context, {injectSamples:true, sampleCount:3})
  否则走原有代码不动
  S2 调用处 (约第 128 行) 加相同分支 (useVerify:true, injectSamples:false)

6.3 在 processSplitMerge 里加分支: Promise.all 的 map 里每个 segment 判断 format
6.4 在 processMultiStep 里加分支: 每步 API 调用前判断 format

注意: executeRealSkill 从 ../services/realSkillExecutor 导入

验证: 文本 SKILL 走旧路径行为不变, 文件夹 SKILL 走新路径, 混用正常

### 步骤 7: 修改 src/components/settings/SkillSettings.vue (+30 行)

文件路径: D:/codex/novel-workshop-vue3/src/components/settings/SkillSettings.vue

在模板的 button id=btn-add-skill 之前加 [真 SKILL 文件夹管理] 区域
需要新增的 script 方法:
- importRealSkillFolder(): 打开文件夹选择对话框, 调用 electronAPI.skillLoadFolder, 添加到 skillStore
- editRealSkill(rs): 在系统文件管理器中打开文件夹
- addToPipelineReal(rs): 把文件夹 SKILL 加入流水线
- removeRealSkill(rs): 从 skillStore 移除
- realSkillList: computed, 过滤 skills.filter(s => s.format === "folder")

验证: 设置页显示真 SKILL 区域, 导入文件夹后显示卡片, 可以加入流水线

### 步骤 8: 集成验证 (8 项验证矩阵)

| 编号 | 验证项 | 方法 | 通过标准 |
| V1 | 文本 SKILL 不受影响 | 配置文本 SKILL 跑去AI味 | 结果与改动前一致 |
| V2 | 文件夹 SKILL 加载 | 导入文件夹 SKILL | 卡片正确显示 |
| V3 | 文件夹 SKILL 执行 | 跑去AI味 | realSkillExecutor 被调用, 输出正确 |
| V4 | preProcess 生效 | SKILL 带 script.js | 输入被预处理 |
| V5 | postProcess 生效 | SKILL 带 script.js | 输出被后处理/验证 |
| V6 | 风格样本注入 | SKILL 带 samples.txt | user message 包含样本 |
| V7 | 链式混用 | 文本+文件夹混用 | 链式调用正常完成 |
| V8 | 沙箱安全 | 脚本尝试 require | 被拦截, 不崩溃 |

验证方法: 用 Playwright 写独立 .js 脚本, 操作 UI 后检查 DOM 状态变化。截图 + JSON 日志 + 时间戳三者缺一不可。

---

## 三、不修改的文件清单 (碰了=违规)

| 文件 | 理由 |
| src/services/aiService.ts | realSkillExecutor 调用同一个 aiService.callAi() |
| src/services/chainExecution.ts | 链式 prompt 构建逻辑不变 |
| src/services/de-ai.js | 硬规则层不变 |
| src/services/deai-samples.js | 38 个风格样本不变 |
| src/services/skillValidation.ts | schema 验证逻辑不变 |
| src/services/chainBreakpoint.ts | 断网续接不变 |
| src/services/agent-scheduler.ts | Agent 调度容器不变 |
| src/stores/deai.ts | 去 AI 味 store 不变 |
| src/stores/pipeline.ts | 流水线 store 不变 |
| src/stores/provider.ts | 供应商 store 不变 |
| electron/main.js | 主进程不变 (只加一行 require skill-loader.js) |
| electron/ipc/storage.js | 存储不变 |
| package.json | 不新增依赖 (vm 模块是 Node.js 内置) |

---

## 四、SKILL 文件夹结构标准

每个真 SKILL 是一个文件夹, 包含:
- SKILL.md (说明书, 必须)
- template.md (指令模板, 必须, 进 system message)
- script.js (可选, 预处理/后处理/验证脚本, vm 沙箱执行)
- samples.txt (可选, 风格参考样本)
- schema.json (可选, 输入输出 JSON Schema)
- meta.json (元数据, 必须, 含 name/version/format/executionMode/outputFormat/author/description)

script.js 钩子:
- module.exports.preProcess = function(input, ctx) {} : API 调用前处理输入
- module.exports.postProcess = function(output, ctx) {} : API 返回后处理/验证输出
沙箱内可用 API: api.log(), api.getContext(), api.setOutput(), api.validate()

---

## 五、架构路由图

用户触发去AI味/生成流水线 -> getSkillTemplate(skillId) -> 判断 skill.format === "folder" ?
  YES -> realSkillExecutor (新增): 读文件夹, 加载 template.md, 加载 script.js, 执行 preProcess, 调 API, 执行 postProcess, 返回结果
  NO -> 现有路径: 返回 template 文本作为 system prompt, callAiApi(template, input)

---

## 六、风险与缓解

| 风险 | 缓解方案 |
| 路由层隔离失效 | format 默认 undefined = text, 只有 format===folder 且 folderPath 非空才走新路径。realSkillExecutor 入口加防御检查, 加载失败回退到文本路径 |
| vm 沙箱安全 | 沙箱不暴露 require/fs/process。脚本超时 5 秒。SKILL 脚本是用户自建。未来可换 isolated-vm |
| 版本兼容 | format 可选, undefined = text。存量 SKILL 自动走旧路径。导入/导出兼容无 format 的旧数据 |
| 路径悬空 | realSkillLoader 做缓存, 加载失败返回错误不崩溃。UI 显示文件夹路径供用户检查 |
| 性能 | realSkillLoader 做内存缓存, 同一文件夹只读一次。文件读取在主进程, 不阻塞渲染层 |
| 链式混用 | 每步独立判断 format。文本+文件夹可在同一条链里混用 |

---

## 七、与白虎 SKILL 的分工

应用层 (你) 做什么:
- 提供文件夹 SKILL 的加载、缓存、执行、沙箱基础设施
- 提供路由分支, 让文件夹 SKILL 和文本 SKILL 各走各的路
- 掌控风格样本的注入权 (选择几个、注入到哪一步)
- 提供验证框架 (preProcess/postProcess/schema)
- 提供进度条和错误反馈

白虎 SKILL (外部) 做什么:
- 把 S1 拆成 S1A/S1B/S1C 三个文件夹 SKILL
- 每个 SKILL 文件夹包含 SKILL.md + template.md + 可选 script.js
- 白虎负责写 SKILL 内容, 应用层负责执行
- 白虎的 script.js 做事件核数量检查、偏转方法轮换检查、首句主语对比等

38 个风格样本放哪里:
放在应用层 deai-samples.js, 不进 SKILL 文件夹。应用层按需选 2-3 个注入到 S1 (改写主力), 不注入 S2 (验证)。

---

## 八、社区调研结论 (已完成, 供参考)

| 方案 | 安全性 | 性能 | 复杂度 | 结论 |
| Node.js vm 模块 | 中等 | 高 | 低 | 采用 |
| isolated-vm | 最高 | 中 | 高 | 备选 (未来升级) |
| vm2 | 高 | 中 | 中 | 不采用 (已废弃) |
| @tanstack/ai-isolate-node | 最高 | 中 | 高 | 不采用 (场景不匹配) |

Codex 自带 SKILL 系统的文件夹结构是最佳参考标准。

---

## 九、验证检查清单 (完成后逐项打勾)

- [ ] 步骤1完成: skill-loader.js 创建, 3 个 IPC 通道注册成功
- [ ] 步骤2完成: preload.js 暴露 3 个新方法
- [ ] 步骤3完成: realSkillLoader.ts 创建, 缓存机制工作
- [ ] 步骤4完成: realSkillExecutor.ts 创建, 完整流程跑通
- [ ] 步骤5完成: skill.ts 加 format/folderPath 字段
- [ ] 步骤6完成: useDeAi.ts 加路由分支, 3 个模式都覆盖
- [ ] 步骤7完成: SkillSettings.vue 加管理 UI
- [ ] V1 验证通过: 文本 SKILL 不受影响
- [ ] V2 验证通过: 文件夹 SKILL 加载正常
- [ ] V3 验证通过: 文件夹 SKILL 执行正常
- [ ] V4 验证通过: preProcess 生效
- [ ] V5 验证通过: postProcess 生效
- [ ] V6 验证通过: 风格样本注入正确
- [ ] V7 验证通过: 链式混用正常
- [ ] V8 验证通过: 沙箱安全 (require 被拦截)

全部打勾后出具完成报告。

---

## 十、改动量预估

| 模块 | 类型 | 预估行数 |
| electron/ipc/skill-loader.js | 新增 | ~120 行 |
| electron/preload.js | 修改 | +12 行 |
| src/services/realSkillLoader.ts | 新增 | ~40 行 |
| src/services/realSkillExecutor.ts | 新增 | ~80 行 |
| src/stores/skill.ts | 修改 | +2 行 |
| src/composables/useDeAi.ts | 修改 | +25 行 |
| src/components/settings/SkillSettings.vue | 修改 | +30 行 |
| 合计 | | ~309 行 |

---

本交接文件由设计对话框生成, 交由执行对话框实现。执行过程中如遇方案与实际代码不符, 以实际代码为准但不擅自改方案, 记录差异并告知用户。
