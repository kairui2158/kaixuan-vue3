# 卷纲层与章节层经验复用 P0 基线（2026-08-25）

## 目标

把设定层已验证的“选择列表 + 唯一当前编辑区 + 独立滚动 + 状态持久化”经验复用到卷纲层和章节层。本阶段只做现状盘点与只读运行时基线，不修改业务代码，不写客户项目数据。

## 规则引用

- `_audit/神意开发经验总结.md`：行为等价、单闭环、真实 Electron/CDP、store/DOM/持久化递归验证、临时载体清理。
- `docs/UI设计经验总结_社区学习提取.md`：导航区只选择对象，主区域只展开当前对象，列表/详情/API 日志独立滚动。
- `docs/UI设计规格参考书.md`：桌面工作区尺寸、滚动容器、按钮与编辑区规范。
- `docs/PIPELINE_FLOW.md`：流水线五层级联、章节树/编辑器下游和存储边界。

## 源码现状盘点

### 卷纲层

- 文件：`src/components/pipeline/PipelinePanel.vue`
- 入口：`#pl-step-3-content`（`pipelineStore.currentStep === 2`）。
- 配置：`#pl-s3-agent`、`#pl-s3-mode`、`#pl-s3-skills-list`。
- 数据配置：字数/卷数区域 `#pl-volume-config`。
- 结果渲染：`v-for="(vol, i) in projectStore.volumes"`，每卷同时渲染完整卷名、卷纲、摘要、锁定和删除操作。
- 反馈：`#pl-volume-generation-feedback`、`#pl-volume-api-log`；当前生成卷还会显示卡片内反馈。
- 操作：`#btn-pl-gen-volumes`、`#btn-pl-gen-single-volume`、`#btn-pl-confirm-volumes`。
- 数据动作：`saveVolume()` 锁定卷并初始化 `projectStore.chapters[vol.id || vol.name]`；`deleteVolume()` 删除对应章节、移除卷并保存项目。

### 章节层

- 文件：`src/components/pipeline/PipelinePanel.vue`
- 入口：`#pl-step-4-content`（`pipelineStore.currentStep === 3`）。
- 配置：`#pl-s4-agent`、`#pl-s4-mode`、`#pl-s4-skills-list`。
- 当前卷：选择器仅显示 `vol.confirmed` 的卷。
- 反馈：`#pl-ch-gen-feedback`、`#pl-ch-api-log`。
- 结果渲染：章节卡片按当前卷过滤后的 `pipelineGenerated === true` 数据全部纵向展开。
- 操作：章节卡含生成正文和删除；底部有 AI 生成、自动生成、确认完成三个入口，后两者当前都调用 `genChapters`，存在重复入口风险。
- 风险：`deleteChapterCard()` 使用 `confirmedVolumes.value[volumeIndex]` 计算卷 ID，而 `selectedVolumeIndex` 来自原始卷数组；必须在 P4 前完成索引边界核验。

## Store 与持久化边界

- `src/stores/project.ts`：`volumes`、`chapters`、`volumesConfirmed`、`chaptersConfirmed`；项目 JSON 还包含 `outlineLocked`、`bookWordCount`、`settingsCollection`。
- `src/stores/pipeline.ts`：`currentStep`、生成状态、进度、取消信号、断点；章节断点含 `volumeId`、`chapterCount`、`nextChapterIndex`、`total`、`phase`。
- 项目持久化使用 Electron storage bridge 和 `storageKey('project_' + currentProjectId)`；兼容 `wa_project_<id>` 与 `wa_project-<id>`。
- 自动创建章节可能使用 `confirm`，生成章节使用 `pipelineGenerated`；显示条件必须在 P4/P6 记录并保持行为等价。

## 生成与恢复边界

- 卷纲支持 auto/single/continue、JSON 解析、卷数校验和续生成；生成日志写入卷纲日志，进度写入 pipeline store。
- 章节按批次生成，支持补充生成、最多 5 次局部重试和章节断点；取消状态应在 P6 真实验证。
- 本阶段不改变生成、重试、断点和取消逻辑。

## P0 待取得运行证据

- [x] 源文件 Electron 由 `start-electron.bat` 启动，CDP 9227 新鲜可连接。原始输出：页面标题 `神意助手`，URL `file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`。
- [x] 流水线真实打开并进入卷纲层。原始 DOM 输出：`#pl-step-3-content` 可见，`#pl-vol-list` 为 `1576x230`，`scrollWidth=1576/clientWidth=1576`，`scrollHeight=230/clientHeight=230`；当前可见 `.pl-volume-card` 数量为 0，但卷卡内的卷名输入、卷纲 textarea、摘要输入、锁定和删除按钮均可见，说明当前数据被直接铺在卷列表中而不是选择后展开详情。
- [x] 进入章节层。原始 DOM 输出：`#pl-step-4-content` 可见，`#pl-ch-cards-area` 没有可见章节卡；`#pl-chapter-wordcount`、已确认卷选择器和三个底部按钮可见，章节层处于空状态，符合“无生成时不渲染章节框”的既有行为。
- [x] 本轮源码业务文件无修改；仅新增本日志和临时只读探针，探针已在 P0 收尾删除。工作区其他差异为本轮之前的历史/用户改动，未清理、未暂存、未提交。

## P0 原始验证摘要

```
taskkill /f /im electron.exe /t -> SUCCESS（旧 Electron 进程全部终止）
cmd /c "start-electron.bat < nul" -> [OK] Application started
GET http://127.0.0.1:9227/json/list -> 200；title=神意助手；url=file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html
node _audit/tmp_p0_volume_chapter_baseline.cjs -> exit 0
VOLUME_STEP: #pl-step-3-content visible; #pl-vol-list 1576x230; no independent scroll; one current volume's full editor/action controls visible
CHAPTER_STEP: #pl-step-4-content visible; no visible chapter cards; word-count/volume selector/action footer visible
```

## 本阶段结论

源码基线和运行时基线均已完成。P0 通过，下一阶段只处理 P1“两层共用工作区规范”，不修改生成算法、断点、取消或供应商调用逻辑。
