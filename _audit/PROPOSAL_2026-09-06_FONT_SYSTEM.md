# 字体系统方案：中文字体打包 + 全局字体选择 + 断链修复

> 版本：v1.0 | 日期：2026-09-06
> 依据：开发经验V2 §1 M1-M5、§5 UI纪律、§6交付纪律
> 状态：待审核，不执行

---

## 一、现状诊断

### 1.1 字体选择断链（隐藏缺陷）

当前字体选择的存储和应用之间存在断裂：

| 层 | 文件 | 行号 | 内容 | 状态 |
|----|------|------|------|------|
| Store | src/stores/settings.ts | 10 | editorFont = ref('serif') | 存值正常 |
| Store | src/stores/settings.ts | 34 | editorFont: editorFont.value | 持久化正常 |
| UI | AppearanceSettings.vue | 16-22 | 下拉框3选项 | 显示正常 |
| CSS变量定义 | tokens.css | 121 | --font-family-editor: Noto Serif SC... | 引用不存在的字体 |
| CSS变量消费 | EditorPanel.vue | 803 | font-family: var(--editor-font, serif) | 变量名不匹配 |
| CSS变量消费 | AiNamingModal.vue | 488,500 | var(--font-family-editor, serif) | 引用不存在的字体 |

**核心断链**：
1. settings.editorFont 存的是 serif/sans-serif/monospace（CSS通用类别）
2. tokens.css 定义的是 --font-family-editor（具体字体名）
3. EditorPanel.vue:803 消费的是 var(--editor-font) — 变量名是 --editor-font，但 tokens.css 定义的是 --font-family-editor，两个变量名不匹配
4. 没有任何代码把 settings.editorFont 的值写入 CSS 变量（没有 setProperty 调用）

结果：用户在设置页选字体，编辑器实际永远用 serif 回退值，选择完全无效。

### 1.2 字体文件缺失

- 项目零字体文件（src/assets/fonts/ 不存在）
- 零 @font-face 声明
- tokens.css 引用 Noto Serif SC 和 Source Han Serif SC，系统未安装时回退到 Georgia, serif
- 用户在 Windows 上看到的实际是系统默认衬线字体（通常是 SimSun 宋体）

### 1.3 全局覆盖现状

当前字体选择只影响编辑器正文区域：
- EditorPanel.vue:803 — 编辑器正文（影响）
- AiNamingModal.vue:488,500 — AI命名弹窗预览（引用了变量但变量断链）
- API对话框、设定层、卷纲层、章节层 — 全部使用 var(--font-family)（界面字体），不受编辑器字体影响

用户期望：编辑器字体选择应该连通全局所有文本内容区域。

---

## 二、社区调研结论

### 2.1 推荐打包字体（OFL开源协议）

| 字体 | 体积 | 特点 | 适用场景 |
|------|------|------|--------|
| 霞鹜文楷 (LXGW WenKai) | ~25MB | 楷体书卷气，手写感 | 默认编辑器字体，小说正文阅读 |
| 思源宋体 (Source Han Serif SC) | ~30MB | 衬线体，7字重 | 正式文本，参考阅读 |
| 思源黑体 (Source Han Sans SC) | ~30MB | 无衬线，7字重 | 界面字体替代，密集信息 |

### 2.2 Windows系统自带中文字体

| 字体名 | CSS font-family | 特点 |
|--------|-----------------|------|
| 楷体 | KaiTi | 系统楷体 |
| 宋体 | SimSun | 系统宋体 |
| 黑体 | SimHei | 系统黑体 |
| 仿宋 | FangSong | 仿宋印刷体 |
| 微软雅黑 | Microsoft YaHei | 界面常用 |

### 2.3 技术方案参考

- @font-face + local() 优先检测系统已装字体，fallback 到打包字体
- Vite 构建时通过 assetsInclude 把 .ttf/.woff2 打包进 asar
- CSS 变量统一管理，一个声明全局生效

---

## 三、详细执行方案

### P0：下载字体文件 + 创建目录结构

**目标**：在 src/assets/fonts/ 下放置3个开源中文字体

**步骤**：
1. 创建目录 src/assets/fonts/
2. 下载霞鹜文楷 Regular TTF（LXGW WenKai-Regular.ttf，约25MB）
3. 下载思源宋体 Regular（SourceHanSerifSC-Regular.otf，约30MB）
4. 下载思源黑体 Regular（SourceHanSansSC-Regular.otf，约30MB）

**影响圈**：新增目录和文件，不改动任何现有代码。

### P1：创建 @font-face 声明文件

**目标**：新建 src/styles/fonts.css，声明所有字体的 @font-face

文件内容：
- 霞鹜文楷: local() 优先 + url() fallback
- 思源宋体: local() 优先 + url() fallback
- 思源黑体: local() 优先 + url() fallback
- 全部使用 font-display: swap

**影响圈**：新建文件，不改动现有文件。

### P2：修复 CSS 变量断链

**改动文件**：src/styles/tokens.css

**改动内容**：
- 第121行：--font-family-editor 改为更完整的 fallback 链
- 新增变量 --editor-font（与 EditorPanel.vue:803 消费的变量名对齐）

修改前：
  --font-family-editor: "Noto Serif SC", "Source Han Serif SC", Georgia, serif;

修改后：
  --font-family-editor: "LXGW WenKai", "Source Han Serif SC", KaiTi, SimSun, Georgia, serif;
  --editor-font: var(--font-family-editor);

**影响圈**：
- --font-family-editor 被 AiNamingModal.vue:488,500 引用 -> 字体回退链改善
- 新增 --editor-font 被 EditorPanel.vue:803 引用 -> 变量名对齐，从无效变为有效

### P3：修复 store -> CSS 变量的写入断链

**改动文件**：src/App.vue

**改动内容**：在 App.vue 中新增 watch，监听 settingsStore.editorFont 变化，调用 document.documentElement.style.setProperty 写入 CSS 变量

fontMap 映射表（11个字体值 -> CSS font-family 字符串）：
- lxgw-wenkai -> LXGW WenKai, KaiTi, serif
- source-han-serif -> Source Han Serif SC, SimSun, serif
- source-han-sans -> Source Han Sans SC, SimHei, sans-serif
- kaiti -> KaiTi, serif
- simsun -> SimSun, serif
- simhei -> SimHei, sans-serif
- fangsong -> FangSong, serif
- microsoft-yahei -> Microsoft YaHei, sans-serif
- serif -> serif
- sans-serif -> sans-serif
- monospace -> monospace

同时写入 --editor-font 和 --font-family-editor 两个变量（覆盖所有消费点）。

**影响圈**：
- App.vue 是根组件，新增 watch 不影响现有逻辑
- --editor-font 被 EditorPanel.vue:803 消费 -> 从无效变为有效
- --font-family-editor 被 AiNamingModal.vue:488,500 消费 -> 从无效变为有效
- 此 watch 不调用 saveConfig，不触发循环（经验 §1 规则6）

### P4：扩展 store 字段（向后兼容）

**改动文件**：src/stores/settings.ts

**改动内容**：
- 第10行：默认值从 serif 改为 lxgw-wenkai
- 第22行：读取时兼容旧值（serif/sans-serif/monospace 仍可用）

**影响圈**：
- editorFont 被 AppearanceSettings.vue:16 消费（v-model绑定）-> 选项扩展后UI需同步更新（P5）
- editorFont 被 App.vue 新增 watch 消费（P3）-> 字段扩展后watch需同步更新（P3已覆盖）
- 向后兼容：旧用户存了 serif，fontMap 里有对应映射，不会出错

### P5：扩展 AppearanceSettings.vue 字体下拉框

**改动文件**：src/components/settings/AppearanceSettings.vue

**改动内容**：第16-22行的 select 选项从3个通用类别扩展为11个具体字体名，分3组：
- 打包字体（3个）：霞鹜文楷、思源宋体、思源黑体
- 系统字体（5个）：楷体、宋体、黑体、仿宋、微软雅黑
- 通用类别（3个）：衬线、无衬线、等宽

使用 optgroup 分组。

**影响圈**：
- settingsStore.editorFont v-model绑定 -> 扩展选项后旧值仍兼容
- 只改 select 的 option 列表，不改其他属性

### P6：在 global.css 中引入 fonts.css

**改动文件**：src/styles/global.css

**改动内容**：在文件顶部新增 @import url(./fonts.css);

**影响圈**：global.css 被 App.vue 引用 -> 全局生效，不影响现有样式

### P7：全局字体覆盖（编辑器字体连通全局文本区域）

**目标**：用户选择的编辑器字体不仅影响编辑器，还影响所有文本内容区域

**方案**：在 P3 的 watch 中，同时写入 --font-family-editor 变量，然后在所有文本内容区域使用此变量

**需要检查和改动的组件**：

| 组件 | 当前状态 | 改动 |
|------|----------|------|
| EditorPanel.vue:803 | var(--editor-font, serif) | 保持不变（P2/P3已覆盖） |
| AiNamingModal.vue:488,500 | var(--font-family-editor, serif) | 保持不变（P2/P3已覆盖） |
| ChatPanel.vue API气泡 | 使用界面字体 | 添加 font-family: var(--font-family-editor) |
| PipelinePanel 各层预览 | 使用界面字体 | 检查并添加 font-family: var(--font-family-editor) |

**原则**：
- 文本内容区域（编辑器、API对话气泡、流水线预览）跟随编辑器字体
- 界面控件（按钮、输入框、标签）仍用 var(--font-family)，不受编辑器字体影响
- 只加 font-family 声明，不改布局/DOM

### P8：Vite 构建配置

**目标**：确保字体文件被打包进 asar

**改动文件**：vite.config.ts

**检查内容**：
1. 确认 assetsInclude 包含 .ttf 和 .otf
2. 确认 build.assetsInlineLimit 不过小（字体文件大于4KB，不会被inline）
3. 确认 electron-builder 配置中 files 包含 dist/assets/fonts/

### P9：验证闭环

**验证步骤**：

1. 构建验证：npm run build:vue 通过
2. 启动验证：源 Electron 启动，应用正常加载
3. 字体加载验证：打开开发者工具 Console，无字体加载 404 错误
4. 设置页验证：设置页 外观设置 编辑器字体下拉框显示11个选项，分3组
5. 选择生效验证：选择霞鹜文楷 编辑器正文立即变字体
6. 持久化验证：退出应用 重新启动 字体保持
7. 全局覆盖验证：API对话框、流水线预览区域字体同步变化
8. 旧值兼容验证：旧用户存了 serif 应用仍正常显示
9. 系统字体验证：选择楷体 编辑器使用系统 KaiTi
10. 回退验证：卸载打包字体 local() 回退到系统字体

---

## 四、影响范围矩阵

| 改动项 | 文件 | 类型 | 影响现有功能 |
|-------|------|------|-------------|
| P0 新增字体文件 | src/assets/fonts/* | 新增 | 无 |
| P1 @font-face 声明 | src/styles/fonts.css | 新增 | 无 |
| P2 修复CSS变量 | src/styles/tokens.css:121 | 修复 | 变量名对齐，从无效变有效 |
| P3 store->CSS写入 | src/App.vue | 新增watch | 无（不触发saveConfig） |
| P4 store默认值 | src/stores/settings.ts:10,22 | 扩展 | 向后兼容旧值 |
| P5 UI下拉框 | AppearanceSettings.vue:16-22 | 扩展 | 向后兼容旧选项 |
| P6 全局引入 | src/styles/global.css | 新增import | 无 |
| P7 全局覆盖 | 多组件CSS | 扩展 | API对话框/流水线预览字体变化 |
| P8 构建配置 | vite.config.ts | 检查/补充 | 无 |
| P9 验证 | -- | 验证 | -- |

---

## 五、风险评估

| 风险 | 等级 | 缓解 |
|------|------|------|
| 字体文件体积增加安装包约85MB | 中 | 3个字体共约85MB，写作应用需要好字体 |
| 字体加载延迟首屏 | 低 | font-display: swap 先用系统字体显示 |
| 旧用户 editorFont=serif 不匹配新选项 | 低 | fontMap 包含 serif 映射，向后兼容 |
| 全局覆盖改动多组件 | 中 | 只加 font-family 声明，不改布局/DOM |
| store saveConfig 循环 | 低 | watch 只调 setProperty，不调 saveConfig（经验§1规则6） |

---

## 六、经验文件引用

| 经验规则 | 本方案对应措施 |
|----------|---------------|
| §1 M1 影响圈声明 | 每步改动前列出影响清单 |
| §1 M2 整文件操作禁令 | 用 apply_patch 逐行编辑，不整文件重写 |
| §1 M3 diff 审查 | 每步改动有 diff 级别说明 |
| §1 M4 隐藏状态保护 | 不改 v-show/v-if 逻辑 |
| §1 规则4 工具失败2次换方案 | 字体下载失败换手动放置 |
| §1 规则5 store单一事实来源 | editorFont 仍在 store，CSS变量由watch写入 |
| §1 规则6 saveConfig不重新赋值 | watch 只调 setProperty，不调 saveConfig |
| §2 规则37 CDP假死 | 验证用源Electron启动，不用CDP |
| §6 规则2 封装前工作区干净 | 封装前 git status 确认干净 |

---

## 七、交付物

1. 3个中文字体文件（src/assets/fonts/）
2. fonts.css @font-face 声明文件
3. tokens.css 变量断链修复
4. App.vue store->CSS变量写入watch
5. settings.ts 默认值扩展
6. AppearanceSettings.vue 下拉框扩展
7. global.css 引入 fonts.css
8. 全局文本区域字体覆盖
9. vite.config.ts 构建配置检查
10. 验证报告

---

## 八、关于全局连通的实现细节

用户要求：编辑器字体选择连通全局。

**实现方式**：
- P3 的 watch 同时写入两个 CSS 变量：--editor-font 和 --font-family-editor
- 这两个变量被以下组件消费：
  - EditorPanel.vue:803 -- var(--editor-font, serif)
  - AiNamingModal.vue:488,500 -- var(--font-family-editor, serif)
- P7 中额外在 API 对话气泡、流水线预览等文本内容区域添加 font-family: var(--font-family-editor)
- 界面控件（按钮、输入框、标签）仍用 var(--font-family)，不受编辑器字体影响

**分离原则**：
- 界面字体（按钮/标签/输入框）= var(--font-family) = 系统字体，清晰紧凑
- 内容字体（编辑器/API气泡/预览）= var(--font-family-editor) = 用户选择的字体，可读舒适
- 两套字体互不干扰，用户切换编辑器字体不会让按钮标签变形
