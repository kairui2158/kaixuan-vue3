# DEV LOG 139 - 正文字数传递修复 + 卷标号显示

**日期**: 2026-09-04
**版本**: 3.20.1
**改动等级**: bugfix (patch)

## 改动文件

- `src/components/pipeline/PipelinePanel.vue` (5处改动)

## 问题根因

### 问题1: 正文字数乱跳

`genBody()` 函数直接使用全局 ref `chapterWords.value`(初始值3500)作为正文字数，而非像 `genChapters()` 那样优先读取 `vol.wordsPerChapter`。`chapterWords.value` 会被多个路径覆盖(saveVolumeConfig/buildTemplateContext/saveChapterConfig)，导致正文层字数在 3500/4000/5000 间乱跳。

### 问题2: 卷标号缺失

卷列表行只显示序号 `{{ i + 1 }}`，不显示总卷数。用户切换项目后无法记住之前选择了多少卷。

## 修复内容

### 1. genBody() 字数修复 (行2667, 2702)

- 新增局部变量 `_bodyWordsPerChapter = Number(vol.wordsPerChapter || chapterWords.value || 3500)`
- bodyGenerationLogs 和 buildChapterExecutionPrompt 使用该变量

### 2. buildTemplateContext 字数修复 (行1656)

- `chapterWords.value || ""` → `Number(vol?.wordsPerChapter || chapterWords.value || 3500) || ""`

### 3. saveVolumeConfig 字数修复 (行1463)

- `chapterWords: Number(chapterWords.value) || 0` → `chapterWords: Number(selectedVolume.value?.wordsPerChapter || chapterWords.value) || 0`

### 4. 卷标号显示 (行376)

- `{{ i + 1 }}` → `{{ volumeCount }}/{{ i + 1 }}`

## 验证

- vue-tsc --noEmit: 通过 (exit 0, 无错误输出)
- vite build: 通过 (built in 2.86s)
- vite build --config vite.protocols.config.ts: 通过 (providerProtocols.cjs 8.18 kB)
- Electron 源码启动: 成功 (无报错, 仅 libpng warning)

## 未验证项

- 客户实操: 正文字数是否稳定在卷级配置值
- 客户实操: 卷标号切换项目后是否正确显示

## 经验规则

- 经验文件规则70已写入 `_audit/神意开发经验总结_v2.md`
