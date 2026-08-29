# 卷纲与章节经验复用 P2-P3：对象选择与唯一编辑区

日期：2026-08-26  
范围：`src/components/pipeline/PipelinePanel.vue`

## P2 卷纲层

- 将卷纲对象从全部展开卡片改为“卷选择列表 + 唯一当前卷编辑区”。
- 选择项使用 `vol.id || index` 作为 Vue key，并继续使用原始 `projectStore.volumes` 索引调用原有保存、锁定和删除函数，避免引入第二份数据源。
- 当前卷编辑区保留卷名、卷纲要、摘要、API 反馈、保存并锁定、删除本卷。
- 没有卷时显示明确空状态，不渲染空编辑框。

## P2 验证

- 构建：`npx vite build` 成功；仅有既有 Vite config、动态导入和 chunk 体积警告。
- 源文件启动：`taskkill /f /im electron.exe /t` 后使用 `cmd /c "start-electron.bat < nul"`，CDP `127.0.0.1:9227` 可连接。
- 真实操作：点击生成流水线 → 点击卷纲。
- 运行结果：`volumes=1`、`editors=1`、活动选择项为 `pl-volume-select-0`、编辑标题为“第一卷”、操作按钮为 `btn-pl-save-volume-0` 与 `btn-pl-delete-volume-0`。
- 列表边界：`clientWidth=343`、`scrollWidth=343`、`clientHeight=304`、`scrollHeight=304`、`overflowY=auto`。
- 页面横向边界：`body clientWidth=1904`、`scrollWidth=1904`。

## P3 章节层

- 将章节对象从全部展开卡片改为“章节选择列表 + 唯一当前章节编辑区”。
- 选择状态使用 `selectedChapterIndex`，并根据当前卷和可见章节数量自动收敛越界。
- 当前章编辑区保留剧情点编辑、生成正文、删除章节入口。
- 删除和正文生成现在先把过滤后的可见章节索引映射回原始章节数组；优先使用稳定 `chapter.id`，避免未生成/手工章节混入时错删或错生成。
- 没有已锁定卷或没有生成章节时，列表和编辑区不渲染，保留明确空状态。

## P3 验证

- 构建和源文件 Electron 启动成功。
- 真实操作：点击生成流水线 → 点击章节。
- 当前客户项目没有已锁定卷/已生成章节，实际结果：`chapterItems=0`、`legacyCards=0`、`editors=0`、`emptyNoVolume=true`、`body scrollWidth=1904/clientWidth=1904`。
- 未以脚本写入测试章节，因此“多章切换、删除、生成正文落点”保留为 P4/P6 的真实对象验证边界，不能把空态证据扩大成完整章节行为通过。

## P4：正文层与章节树/编辑器联动核对

- 修复范围：`src/components/pipeline/PipelinePanel.vue` 正文层对象查找。
- 根因：章节列表只显示 `pipelineGenerated === true` 的章节，但正文生成、插入、记忆确认和模板上下文仍有路径直接使用过滤列表索引访问原始章节数组；存在未生成章节混入时会错写、错插入或错抽取记忆的风险。
- 改正：增加 `getVisibleChaptersForVolume()` 与 `getBodyChapterByVisibleIndex()`，按稳定 `chapter.id` 从原始数组找回对象；正文内容、生成、插入、记忆确认、工具插入和模板上下文统一调用该映射。

## P4 验证

- 构建：`npx vite build` 成功；保留既有 Vite config、动态导入和 chunk 体积警告。
- 源文件启动：`taskkill /f /im electron.exe /t` 后使用 `cmd /c "start-electron.bat < nul"`，CDP `127.0.0.1:9227` 可连接，页面标题“神意助手”。
- 流水线真实入口：点击 `#btn-tree-gen` 后，`#pipeline-panel` 可见，卷选择项 `1`，章节选择项 `0`，空态文案“暂无已锁定卷纲，请先在卷纲层保存并锁定本卷”，body `scrollWidth=1904/clientWidth=1904`。
- 章节树真实入口：关闭流水线后点击 `#btn-tree-vol-outline-vol_1787573439374_1`，编辑器模式为“卷纲层”，标题为“第一卷 - 卷纲”；点击 `#btn-tree-ch-plot-ch_1787573439374_0_1`，模式为“章节层”，标题为“卷一：基石设定层 - 剧情”。
- 边界：当前客户项目没有已锁定卷和已生成章节，本轮不能凭空写入测试数据，因此多章节选择、删除、正文 API 成功落点、章节树正文同步仍未标记为完整通过，需在有真实生成对象时继续核销。

## P5：递归 UI 与响应式验证

- 修复：将 `deleteChapterCard` 从 `genBodyForSelected` 错误嵌套作用域中移出，保持模板可直接调用。
- 构建：`npx vite build` 成功；保留既有 Vite config、动态导入和 chunk 体积警告。
- Electron/CDP：重启源文件应用后，`#btn-tree-gen` 打开流水线；`#pipeline-panel`、`#btn-close-pl`、卷列表均存在，body `1904/1904`。
- 响应式边界：视口 `1904x975`、`1280x800`、`960x720` 的 body `scrollWidth/clientWidth` 分别为 `1904/1904`、`1280/1280`、`960/960`；编辑器和章节树随宽度收缩，无页面级横向溢出。
- 结果：P5 结构与响应式复核核销。

## P6：取消、重试与断点恢复

- 根因发现：chain 内 `pipelineStore.refreshBreakpoint()` 是异步函数却未 `await`，每步 `saveBreakpoint()` 也未等待落盘，导致断点对象读取和持久化存在实际失效风险。
- 最小修复：`await pipelineStore.refreshBreakpoint()`；每个 chain Skill 成功后 `await pipelineStore.saveBreakpoint(...)`。
- 构建与源文件启动：修复后 `npx vite build` 成功；杀 Electron 后 `start-electron.bat` 启动成功，CDP `9227` 可连接。
- UI 核验：流水线真实入口存在关闭按钮 `#btn-close-pl`；未运行生成时取消按钮不显示，属于正确空闲态；页面 `body scrollWidth=1904/clientWidth=1904`。
- 边界：当前客户项目没有满足生成条件的锁定大纲/锁定卷/真实 API 请求，本轮未伪造生成数据，因此“点击取消后 AbortController、断点文件重启恢复、失败重试次数”仍需在真实生成对象和供应商响应可用时核销，不能标记为完整行为通过。

## P7：本轮交付收尾

### 已核销

- P0 基线、P1 共用工作区规范、P2 卷纲选择+唯一编辑区、P3 章节选择+唯一编辑区。
- P4 正文层稳定 ID 映射、章节树卷纲/概要 Tab 模式隔离、空态与页面边界。
- P5 递归入口与 1904/1280/960 三档响应式边界；修复 `deleteChapterCard` 作用域遗留。
- P6 chain 断点读取/保存的异步等待根因修复；空闲态取消按钮隐藏、流水线关闭入口和页面边界。

### 未扩大解释的验证边界

- 当前客户项目没有已锁定卷和已生成章节，未伪造数据，因此多章节切换、删除、正文 API 成功落点、取消请求中断、断点跨重启恢复没有被标成全链路通过。
- 当前构建和源文件 Electron 启动已通过；供应商实际生成响应需客户在有可生成项目和已配置供应商的环境中按交付步骤核验。

### 本轮改动文件

- `src/components/pipeline/PipelinePanel.vue`
- `_audit/DEV_LOG_2026-08-26-volume-chapter-reuse-P2-P3.md`
- `_audit/神意开发经验总结.md`

### 清理

- 本轮未产生需保留的临时探针、截图或中间文件；没有执行全局 `git clean`，避免误删用户/历史文件。

## 追加复核：章节生成断点异步链

- 复核发现：章节生成路径仍有 `const savedBreakpoint = pipelineStore.refreshBreakpoint()` 和同步调用 `saveChapterBreakpoint()` 的遗留，chain 路径已修复但章节路径尚未完全收口。
- 修复：等待 `refreshBreakpoint()`；将 `saveChapterBreakpoint` 改为 async，并等待开始、重试等待、进度、校验失败和异常保存点。
- 中间验证：首次直接在普通函数中加入 `await` 导致构建失败，错误为 `PipelinePanel.vue:2146 Unexpected reserved word 'await'`；随后把辅助函数和所有调用点一起改为 async。
- 最终验证：`npx vite build` exit 0；重启 Electron 后 CDP 页面标题“神意助手”，URL 为 `file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`，body `1904/1904`，章节树卷纲按钮 `1`、概要按钮 `4`，无控制台错误记录。

## 追加复核：正文层章节选择器一致性

- 发现：正文层章节下拉框 `bodyVolumeChapters` 原先使用卷的原始章节数组，而正文内容/生成入口已按 `pipelineGenerated === true` 的可见章节映射；手工章节混入时会出现用户选择项与实际读取对象错位。
- 修复：正文层章节下拉框改为只显示已生成章节，与 `getBodyChapterByVisibleIndex()` 使用同一可见集合。
- 最终构建：`npx vite build` exit 0。
- 最终 Electron/CDP：页面标题“神意助手”；打开流水线后 `pipeline=true`、`volumeSelect=true`、章节空态文案正确、body `1904/1904`；当前客户项目没有锁定卷，所以正文章节下拉选项为 `0`，这是数据状态而非 UI 错误。

## 追加复核：卷纲草稿选择回归修复

- 发现：卷纲选择索引 watcher 原先会在选中未锁定卷时，强制跳回第一个已锁定卷；这会使草稿卷无法进入当前卷编辑区，与“卷纲列表 + 唯一编辑区”的目标行为不一致。
- 最小修复：watcher 仅在卷被删除或项目切换导致索引越界时校正索引，不再以 `confirmed` 状态干预用户的卷纲选择；章节层仍由 `confirmed` 条件控制可用性。
- 构建：`npm run build:vue` exit 0；176 个模块转换完成，保留既有 Vite 配置、动态导入和 chunk 大小警告。
- 源文件 Electron：`taskkill /f /im electron.exe /t` 后使用 `start-electron.bat` 启动成功，CDP `127.0.0.1:9227` 可连接。

## P2 真实隔离项目核验（2026-08-26）

- [x] 通过项目管理 UI 创建隔离项目 `__codex_volume_chapter_audit_20260826__`，未使用脚本写入业务数据。
- [x] 通过流水线 UI 保存并锁定第一卷；DOM 文本为 `第一卷100000 字 · 已锁定✓`，卷名/卷纲/摘要输入框均为只读。
- [x] 锁定卷进入章节层后，未生成章节时显示 `暂无章节，请先生成`，章节生成按钮因当前未生成状态按既有规则受控。
- [x] 杀 Electron 后使用 `start-electron.bat` 重启，重新加载隔离项目，再打开流水线，锁定卷与章节空态均恢复。
- [x] P2 结论：卷纲选择、锁定、只读保护、项目持久化、重启恢复、章节层传递已取得真实 DOM 证据。

证据摘要：

```text
卷纲锁定后：第一卷100000 字 · 已锁定✓
锁定输入：readonly=[true,true,true]
章节空态：暂无章节，请先生成
重启并加载隔离项目后：第一卷100000 字 · 已锁定✓ / 暂无章节，请先生成
```

## P3/P4 真实核验（2026-08-26）

- [x] 每章字数填写 `3500` 后触发 change，输入框变为只读，状态显示 `本卷字数已锁定`，预计章数为 `29`，章节生成入口解锁。
- [x] 真实 API 分批生成章节：`5 -> 10 -> 15 -> 20 -> 25 -> 29`，日志明确显示“补充生成”，完成日志为 `章节生成完成，共 29 章`。
- [x] 章节列表有 29 个稳定选择项，正文选择器同步显示 28 个（删除前/后取证时机不同，删除后为 28）。
- [x] 选择第三章后删除，列表从 29 变 28；章节树节点从 30 变 29；当前章节选择收敛到“第四章 藏经阁风波”，无越界。
- [x] 章节删除后正文选择器重新列出剩余章节，未保留被删章节的索引。
- [x] 确认章节进入正文层后，选择正文目标章节并触发真实 API；完成后主编辑器 `#editor-content` 获得 4140 字符正文，证明正文生成结果进入正确编辑器上下文。

证据摘要：

```text
章节生成：已生成 5/29 章 ... 已生成 25/29 章 ... 章节生成完成，共 29 章
删除第三章：before=29/tree=30 -> after=28/tree=29/current=第四章 藏经阁风波
正文 API：editor-content length=4140
```

## P4/P5/P6 收尾核验边界（2026-08-26）

- [x] 正文生成后保存编辑器，`#editor-content` 保留 4140 字符；点击“提取记忆”确实打开“记忆变更预览”，并明确要求确认后写入记忆库。
- [ ] 记忆提取结果未在本轮供应商等待窗口内返回，不能把“预览弹窗已打开”标记为记忆抽取/审核/保存全通过；该项保留为外部 API 响应未完成的验证边界。
- [x] 取消/重试/断点路径做源码核对：流水线存在 `#btn-pl-cancel-generation`；章节生成每批最多重试 5 次，失败保存 `failed` 断点，成功 `clearBreakpoint()`；分批循环实现不足章节补充与标题去重。真实中断注入仍需受控失败响应才能核销行为证据。
- [x] 删除隔离验收项目 `__codex_volume_chapter_audit_20260826__`，项目管理 UI 最终显示 `暂无项目`，未留下本轮验收业务数据。
- [ ] P6 全链路不能标记 PASS：P4 记忆实际 API 返回、P5 真实取消/失败重试/重启续跑尚缺独立行为证据；本轮不以静态代码替代真实核验。

## 后续根因修复（2026-08-26）

- [x] 定位记忆抽取长时间加载的应用侧放大因素：`EditorPanel.vue` 同时启用了 `memoryExtractor` 的两次 JSON 尝试和 `aiService` 的通用网络重试，单次失败可能被放大为多次 300 秒请求。
- [x] 最小修复：记忆抽取调用 `aiService` 时设置 `retry: false`，保留抽取器自身的一次 JSON 修复尝试，避免网络重试与 JSON 修复重叠。
- [x] `npm run build:vue` 重新构建成功，输出 `176 modules transformed`、`✓ built`；源文件 Electron 已用 `start-electron.bat` 重启，CDP `9227` 可连接。
- [ ] 记忆抽取供应商响应和取消/失败断点行为仍需真实 API 结果或受控失败响应，当前不能标记 P4/P5/P6 完成。
- CDP：页面标题“神意助手”；点击生成流水线后 `pipeline=true`、`close=true`、卷纲选择项 `1`、`volumeEditor=true`、章节空态为“暂无已锁定卷纲，请先在卷纲层保存并锁定本卷”，body `1904/1904`。
- 边界：仍没有向客户项目写入锁定卷或生成章节，因此多卷切换、章节切换/删除、正文成功落点、真实取消和跨重启断点恢复仍需真实可生成数据核验。

## 追加复核：章节删除与断点清理闭环

- 发现：删除当前章节后，正文层可能仍保留已删除章节的选择索引和生成结果；chain/章节生成完成后，异步 `clearBreakpoint()` 未等待，存在下一次读取旧断点的竞态。
- 最小修复：删除章节后按剩余可见章节数量收敛章节索引，清空正文临时结果并刷新章节树；chain 与章节生成完成路径均 `await pipelineStore.clearBreakpoint()`。
- 构建：`npm run build:vue` exit 0；176 个模块转换完成，保留既有非阻断警告。
- 源文件 Electron/CDP：重启成功；流水线 `pipeline=true`、关闭按钮存在、卷纲唯一编辑区存在、章节无锁定卷空态正确，body `1904/1904`。
- 边界：当前项目没有真实生成章节，删除后的对象、正文落点、取消请求和跨重启断点仍不能伪造为完整行为通过。

## 2026-08-26 P4/P5 继续核验：前置条件阻断记录

- [x] 通过项目管理 UI 创建隔离项目 `__codex_final_audit_20260826__`，随后通过项目管理 UI 删除，项目列表恢复为空；未使用脚本写入客户业务数据。
- [x] 真实检查新建项目的章节树：只有卷/纲/章节概要入口，没有已生成的正文章节入口。
- [ ] P4 记忆抽取未核销：`#editor-content` 实际 DOM 为 `textarea[disabled]`，正文抽取按钮没有可用正文上下文，无法真实触发“提取记忆 → 审核 → 确认写入 → 记忆视图”链路。
- [ ] P5 取消/失败重试/跨重启断点未核销：当前没有满足流水线生成条件的锁定卷纲和可生成章节，未伪造供应商响应或项目数据。
- [x] 代码静态复核仅作为实现依据：`pipelineStore.cancelGeneration()` 使用 `AbortController`；章节生成保存 `started/progress/retry-wait/failed` 断点并在成功后等待清理；这些不能替代真实行为证据。
- [x] 验证工具失败记录：首次点击项目按钮时被全屏流水线覆盖层拦截，按真实顺序关闭流水线后项目管理可正常打开；这属于测试顺序问题，不是项目按钮失效。

结论：本轮获得了隔离项目创建/删除和阻断原因的真实证据，但 P4、P5 仍不能标记完成；必须在已锁定卷纲、已生成正文且供应商可用的真实项目上继续核验，随后才能进入 P6 全链路回归。

## 追加复核：草稿卷可编辑与章节空态

- CDP 真实读取源文件 Electron 当前界面：卷纲当前编辑区存在，卷名输入和卷纲文本区均未带 `readonly`；说明未锁定草稿卷仍可编辑。
- 同一状态下章节层显示“暂无已锁定卷纲，请先在卷纲层保存并锁定本卷”，章节卡片数量为 `0`，没有把未锁定卷误开放到章节层。
- 页面横向边界：`body scrollWidth=1904/clientWidth=1904`。
- 为避免改变客户数据，本次没有点击“保存并锁定本卷”，因此锁定后的只读保护和锁定数据向章节层传递仍保留为真实行为验证边界。

## 追加复核：正文上下文卷索引一致性

- 发现：`buildTemplateContext()` 原先用卷纲层 `selectedVolumeIndex` 与正文层 `bodyChapterIndex` 混合取值；正文层切换卷后，SKILL 上下文可能读到错误卷的章节。
- 最小修复：上下文统一使用 `bodyVolumeIndex`，并通过 `getBodyChapterByVisibleIndex()` 和可见章节集合读取当前章节，不再回退到未生成章节。
- 构建：`npm run build:vue` exit 0；176 个模块转换完成，保留既有非阻断警告。
- 源文件 Electron/CDP：重启成功；卷纲编辑区存在，三个输入控件均为 `readonly=false`，章节空态正确，body `1904/1904`。
