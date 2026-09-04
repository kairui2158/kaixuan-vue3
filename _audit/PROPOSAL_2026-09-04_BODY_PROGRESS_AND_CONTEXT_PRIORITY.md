# 修复方案：正文层进度弹窗缺失 + 主页编辑器上下文优先级

## 根因总结

### 问题一：正文层切换章节后进度条弹窗不显示

根因：PipelinePanel.vue 中设定层、卷纲层、章节层各有独立的 FeedbackVisible computed（绑定 activeGenerationFeedbackStep === 1/2/3），但正文层（step 4）没有对应的 bodyGenerationFeedbackVisible computed 和 overlay 模板。genBody() 函数（行 2603）调了 startGeneration() 和 updateProgress() 但从未设置 activeGenerationFeedbackStep.value = 4。正文层模板区也没有 progress overlay 的 HTML 结构。第一次正常只是恰好章节层弹窗残留未关闭，切章节后状态重置就消失了。

### 问题二：主页编辑器 API 识别混乱

根因：ChatPanel.vue 的 sendMessage 函数（行 514+）构建 chatCtx 时，outlineContent 初始值写死 projectStore.outlineText（完整大纲），系统提示里大纲和编辑器内容平级注入。模型分不清编辑器内容是主创作对象还是大纲是主创作对象。两套逻辑（大纲工作台锁定流水线 vs 主页编辑器共创）混用同一套上下文优先级。

正确关系：
- 闭环 A（大纲工作台 -> 流水线）：锁定大纲 + 独立 SKILL/Agent -> 批量生成，大纲是主
- 闭环 B（主页编辑器 -> API 共创）：编辑器内容为主，大纲退为参考资料
- 两个闭环的上下文优先级和系统提示结构各自独立

---

## 执行计划

### P0：正文层进度弹窗修复

文件：src/components/pipeline/PipelinePanel.vue

步骤：

1. 新增 bodyGenerationLogs ref 和 bodyGenerationFeedbackVisible computed（行 ~1192 附近，紧跟 chapterGenerationLogs 之后）

2. genBody() 函数（行 2603）开头，pipelineStore.startGeneration() 之后，新增：
   - activeGenerationFeedbackStep.value = 4
   - bodyGenerationLogs.value = []

3. genBody() 函数内，pipelineStore.updateProgress 调用后，加 bodyGenerationLogs.value.push(...)

4. 在正文层模板区（v-show pipelineStore.currentStep === 4 区域内，行 ~635 之后），新增 progress overlay HTML 结构，结构与章节层完全一致，仅替换 id 前缀为 pl-body-、title 为 正文 AI 生成进度、close 函数为 closeBodyGenerationFeedback、log 数据源为 bodyGenerationLogs

5. 在 appendPipelineStream 函数（行 ~965 附近）中，step === 4 时推送到 bodyGenerationLogs

验证：
- 源 Electron 启动后，正文层生成第一章 -> 弹窗显示、进度条更新
- 切换到第二章生成 -> 弹窗重新显示，不残留上一章日志
- 生成完成 -> 弹窗保留，可手动关闭
- 取消生成 -> 弹窗显示取消状态，可关闭

经验引用：S7 规则 18/20（按钮闭环与状态守卫）、S8 规则 42-44（按钮功能闭环最低标准）

---

### P1：ChatPanel.sendMessage 上下文优先级重构

文件：src/components/chat/ChatPanel.vue

步骤：

1. chatCtx 初始值重构（行 ~624）
   - outlineContent 字段改名为 referenceOutline，语义降级为参考资料
   - 初始值从 projectStore.outlineText 改为空字符串，仅在无 activeTab 或主编辑器模式时才填充完整大纲
   - 新增 editorContent 字段，初始值为 editorStore.activeTab?.content || 空字符串

2. 按页签模式填充逻辑重构（行 ~657-680）
   - vol-outline 模式：editorContent = 卷纲要内容；referenceOutline = 项目大纲摘要（截断前 500 字）
   - ch-plot 模式：editorContent = 章节剧情内容；referenceOutline = 所属卷的纲要摘要（截断前 500 字）
   - ch-body 模式：editorContent = 章节正文内容；referenceOutline = 所属卷的纲要摘要（截断前 500 字）
   - 无 mode（主编辑器）：editorContent = 编辑器内容；referenceOutline = 完整大纲

3. 系统提示注入顺序重构（行 ~700-720）
   当前顺序：agentPrompt -> 设定上下文 -> 触发匹配设定 -> 编辑器内容（ctxText）-> 记忆 -> 编辑协议
   新顺序：
   1. agentPrompt（智能体系统提示）
   2. 编辑器内容（标注为主创作上下文）
   3. 设定上下文（标注为已绑定设定）
   4. 触发匹配设定（标注为触发匹配设定）
   5. 记忆上下文（标注为相关记忆）
   6. 参考大纲（标注为参考资料-大纲概要）
   7. 编辑协议 / 只读协议
   编辑器内容从原来的第 4 位置提升到第 2，大纲从第 1 位置降到最后。

4. buildTemplateContext 函数（行 299-345）同步重构
   - outlineContent 返回字段改名为 referenceOutline
   - 新增 editorContent 字段，按 activeTab.mode 填充当前编辑器内容
   - outlineContent 的填充逻辑与 sendMessage 中的 referenceOutline 保持一致

5. getWorkspaceState（行 ~345）同步调整
   - outline 字段保留（只读快照），但新增 editorContent 字段
   - 工具读取时优先取 editorContent

验证：
- 源 Electron 启动后，打开卷纲纲要页签 -> API 对话中检查 system prompt 中编辑器内容在大纲之前
- 打开章节剧情页签 -> API 对话中检查编辑器内容（章节剧情）在卷纲要之前
- 打开正文页签 -> API 对话中检查正文内容为第一上下文
- 主编辑器无页签 -> 大纲恢复为完整上下文
- SKILL 模板变量 outlineContent 的引用同步改为 referenceOutline

经验引用：S8 规则 62（outlineContent 上下文字段不能恒注入完整大纲）、S3 规则 21-23（按钮闭环）、S1 M1（影响圈声明）

---

### P2：build:vue 构建验证

- npm run build:vue -> 0 errors
- 检查无 TS 类型错误
- 检查无未引用的变量/函数

---

### P3：源 Electron 启动 + CDP 验证

引用经验：S2 规则 18（源 Electron 启动路径）、S2 规则 28-30（真实用户级验证）、S8 规则 59（CDP 验证纪律）

1. npm run build:vue 重建 dist-renderer
2. 杀掉残留 Electron 进程
3. 启动源 Electron：node_modules/electron/dist/electron.exe . --remote-debugging-port=9227 --user-data-dir=.userdata --gpu-cache-dir=.userdata/gpucache
4. 等 8 秒，确认窗口可见、CDP 连接成功
5. CDP 验证项：
   - 控制台无运行时错误
   - 正文层页签可见、生成按钮可点击
   - 正文进度弹窗模板 DOM 存在（#pl-body-generation-overlay）
   - ChatPanel sendMessage 上下文中 referenceOutline 和 editorContent 字段存在
6. 模拟操作验证：
   - 切到正文层，点击生成正文，确认弹窗显示
   - 切换章节再生成，确认弹窗重新显示
   - 打开卷纲纲要页签，发送 API 消息，检查 system prompt 中编辑器内容在大纲之前

---

### P4：经验文件和开发日志更新

1. 经验文件 _audit/神意开发经验总结_v2.md 追加规则 66-67：
   - 规则 66：流水线每层的进度弹窗必须绑定独立的 activeGenerationFeedbackStep 值和独立的 overlay 模板。genBody() 必须在 startGeneration() 后设置 activeGenerationFeedbackStep.value = 4，否则切换章节后弹窗消失。
   - 规则 67：主页编辑器 API 上下文优先级必须以编辑器内容为主、大纲为参考资料。chatCtx.outlineContent 恒注入完整大纲会导致模型分不清主次。大纲工作台锁定服务流水线和主页编辑器共创服务是两套独立闭环，上下文优先级不能混用。

2. 开发日志 _audit/DEV_LOG_2026-09-04-editor-api-unified-upgrade.md 追加本次修复记录

---

### P5：封装

- 版本号 v3.19.4 -> v3.19.5
- npm run build 生成 NSIS 安装器
- 清理旧安装包只保留最新
- 清理临时脚本和调试文件
- 工作区干净后 git commit

---

## 执行纪律

1. 每步完成后必须引用证据（file:line / 命令输出 / CDP 验证结果）
2. apply_patch 失败 1 次后换 Set-Content 写文件
3. 不允许用安装版/网页模式验证，必须源 Electron 启动
4. 验证脚本写到 scripts/tmp/，完成后清理
5. 构建失败不允许封装，必须修复到 0 errors
6. 经验文件和开发日志必须同步更新
