# 2026-09-20 Graphite Ink 设计融合 P0-P6

## 目标

按 `docs/design-fusion-graphite-ink-v2.md` 执行全应用设计融合，并按“做新去旧”铁律清零新旧并存。

## 阶段结果

| 阶段 | 范围 | 结果 |
|---|---|---|
| P0 | Token 单源、别名删除、Graphite Ink 双主题基座 | 完成 |
| P1 | Toast / Tooltip / EmptyState 单源化 | 完成 |
| P2 | Chat 与 ai-content 硬编码色 token 化 | 完成 |
| P3 | G6 图谱、记忆状态、诊断面板 token 化 | 完成 |
| P4 | overlay 类名与 z-index 层级 token 统一 | 完成 |
| P5 | keyframes、will-change、backdrop-filter 收口 | 完成 |
| P6 | 现役规格、社区经验、v5 经验、日志回写 | 完成 |

## DELETE-CHECK 汇总

```text
DELETE-CHECK | 7 类旧 overlay 类名 | 可删 | 0 | 无行为影响，仅视觉/层级来源变化 | .modal-overlay + --z-* token | P4 | rg "\.(pl|ow|pm|dash|mem|rt|naming)-overlay\b" src
DELETE-CHECK | 27 个无消费者 keyframes | 可删 | 0 | 无行为影响，减少死动画 | 保留 wh-spin / menuFadeIn 等活跃消费者 | P5 | rg "@keyframes" src
DELETE-CHECK | 常驻 will-change transform/opacity | 可删 | 5 个样式选择器 | 无交互行为影响，降低常驻 GPU 层 | 仅动画期临时提升 | P5 | rg "will-change" src
DELETE-CHECK | 组件级 backdrop-filter 数值 | 可删 | panel/loading/glass 三处 | 遮罩视觉由 token 统一 | var(--overlay-blur) | P5 | rg "backdrop-filter" src
DELETE-CHECK | --radius-btn 等 token 别名与无消费者 token | 可删 | 0 | 无行为影响，单源 token 替代 | --btn-radius 等语义 token | P0/P5 | node scripts/verify-design-fusion-legacy.mjs --phase=P5
DELETE-CHECK | DOM/notyf/内联 Toast | 可删 | 0 | 通知统一走 service | toastService + ToastViewport | P1 | rg "notyf|dom-toast-container|\.toast\b" src
DELETE-CHECK | 局部 tooltip 与分裂空态类名 | 可删 | 0 | 可访问性与视觉统一 | 统一 data-tooltip + EmptyState | P1 | rg "data-tooltip|empty-hint|naming-empty" src
DELETE-CHECK | 文档旧规则句 | 可删 | 现役文档命中 | 防止后续按旧规格回写旧实现 | Graphite Ink v2 现役规格 | P6 | rg "wh-overlay|--glass-blur|--radius-btn" docs
```

禁删清单未进入删除 diff：`useModalQueue`、`app-confirm=9000`、`ApiChatInput`、PipelinePanel `v-show`、`[data-density]`、theme 默认 light、LXGW 字体链路、语义色 token、`reduced-motion`、`shenyi_resizer_*` key、历史 DEV_LOG。

## 验证

- `node scripts/verify-design-fusion-legacy.mjs --phase=P5`：PASS，0 non-whitelisted legacy findings。
- `npm run type-check`：exit 0。
- `npm run build:vue`：exit 0，主应用 + protocols 双构建成功。
- `npm run test:services`：73 files / 703 tests 全过。
- `node scripts/verify-app-confirm-layering.mjs`：PASS，`overlayZ 9000 > outlineZ 3000`；末尾 profile 清理出现 Windows EPERM 警告，进程 exit 0。

## 经验回写

- `docs/UI设计规格参考书.md` 更新为 Graphite Ink v2 现役版本，补 overlay、层级、动画门禁、密度与布局规格。
- `docs/UI设计经验总结_社区学习提取.md` 删除旧问题清单与旧 `.wh-overlay` 示例，替换为现役实现。
- `_audit/神意开发经验总结_v5.md` §5 规则 31 改写为禁止常驻 will-change；新增规则 36/37 记录现役文档复核与 overlay 单源规则。

## 2026-09-20 回头看补修

### 新发现

- P4 旧扫描器只识别 7 类旧前缀，漏掉“新外壳、旧遮罩语义”的实现：`AgentSettings` 1 处、`SkillSettings` 8 处、`PipelineFlow` 2 处、`PipelinePanel` 6 处（含交接清单外的 `pl-ch-detail-overlay`）、`EditorPanel` 1 处。
- `--bg-overlay` / `--bg-overlay-strong` / `--bg-overlay-soft` / `--modal-overlay-bg` 仍与 `--overlay-level-1` 并存；`modal.css` 还有 fallback 链。
- `--z-modal-high`、`--z-sticky-header`、`--z-drawer` 无消费者。
- `pl-agent-bar` 使用 `--bg-overlay-soft` 表达表面 tint，不是遮罩语义，需语义化迁移为 `--surface-agent-bar`。

### DELETE-CHECK 追加

```text
DELETE-CHECK | 组件自定义 fullscreen overlay（agent/skill/pf/pl/editor 共 18 处实例） | 可删 | 18 处模板消费 | 无行为影响；保留 modalQueue zIndex、@click.self、内容类尺寸/滚动 | .modal-overlay.modal-nested | 回头看 | rg "agent-import-overlay|skill-(import|edit)-overlay|pf-dialog-overlay|pl-(ch-detail|memory-preview|add-setting)-overlay|pl-binding-import-preview|editor-memory-overlay" src
DELETE-CHECK | --bg-overlay / --bg-overlay-strong / --bg-overlay-soft / --modal-overlay-bg | 可删 | src 内 0 消费 | 遮罩改 --overlay-level-1；panel backdrop / confirm backdrop 保持背景层行为 | --overlay-level-1；pl-agent-bar 改 --surface-agent-bar | 回头看 | rg "--bg-overlay|--modal-overlay-bg" src
DELETE-CHECK | --z-modal-high / --z-sticky-header / --z-drawer | 可删 | 0 | 无行为影响 | 现役 10 层 z token | 回头看 | node scripts/verify-design-fusion-legacy.mjs --phase=P5
DELETE-CHECK | modal.css overlay fallback 链 | 可删 | 1 | 无行为影响，单源收紧 | var(--overlay-level-1) | 回头看 | rg "var\(--overlay-level-1," src/styles/modal.css
DELETE-CHECK | 扫描器只识别 7 类旧前缀的盲区 | 可删 | 1 条旧规则 | 防止自定义 overlay 旁路回归 | 任意 `*-overlay` fixed+inset+背景规则、旧遮罩 token、无消费者 z token、fallback 链 | 回头看 | node scripts/verify-design-fusion-legacy.mjs --phase=P5
```

### 回头看验证

- `node scripts/verify-design-fusion-legacy.mjs --phase=P5`：PASS，0 non-whitelisted legacy findings。
- `node --check scripts/verify-design-fusion-legacy.mjs`：exit 0。
- `npm run type-check`：exit 0。
- `npm run build:vue`：exit 0，主应用 + protocols 双构建成功。
- `npm run test:services`：73 files / 703 tests 全过。
- `node scripts/verify-app-confirm-layering.mjs`：PASS，`overlayZ 9000 > outlineZ 3000`，Escape 只关闭确认层；末尾 profile 清理为既有 Windows EPERM 警告，进程 exit 0。

### 第5轮：格局与文档同步

#### 反查

- 布局预设已落实：`AppearanceSettings` 布局组提供专注写作 / 平衡 / 对话优先与恢复默认；全部通过 `requestLayoutPreset` 调 `useResizers` 单源，无组件旁路读写 `shenyi_resizer_*` / `shenyi_layout_preset`。

#### 新发现

- `docs/UI设计规格参考书.md` 第十四章有布局预设，但缺响应式断点表；源码已收敛到 600/760/799/1023/1279/1280/1600/2560，文档未同步。

#### 修复

- 规格书补“响应式断点规格”：8 个边界语义 + 断点单源规则；新增断点必须先改扫描器白名单并同步本表。

#### 第5轮验证

- `node scripts/verify-design-fusion-legacy.mjs --phase=P5`：PASS，0 non-whitelisted legacy findings。
- `node --check scripts/verify-design-fusion-legacy.mjs`：exit 0。
- `npm run type-check`：exit 0。

## 2026-09-20 20轮反查

### 第1-2轮：已修复

- 颜色残留、焦点 outline、AppIcon 图标统一、button reset、扫描器 P1 规则增强。

### 第3轮：断点与焦点单源

- 焦点治理收敛到 `useModalQueue`：open 记录 origin 与触发元素，nextTick 聚焦首个可交互控件；close 回父模态控件或 origin；Tab 在最顶层模态内环绕；Escape 走 `closeTop()`。
- `useModalQueue.spec.ts` 新增 3 个焦点用例，焦点相关合计 10/10。
- 断点收敛：`560→600`、`700→600`、`768→760`、`900→760`、`1200→1023`、`1920→1600`，`global.css` 边界修正为 `600/1023/1279`，合并 MQ-4/MQ-5。
- 扫描器新增 P3 断点白名单：max-width 600/760/799/1023/1279；min-width 800/1024/1280/1600/2560。

### 第4轮：模态焦点根契约

#### 新发现

- 动态 `modalQueue.open()` 的扫描规则从 visibility map 反推 queue id，PipelinePanel 的 watch key 是短 key（`container` 等），真实 queue id 在 `ids` 常量里，导致误报。
- 换用 `modalQueue.getZIndex('...')` 字面量作契约锚点后，暴露真实缺口：`AppConfirmModal` 调用 `getZIndex('app-confirm')`，但根节点缺 `data-modal-id="app-confirm"`。

#### 修复

- `scripts/verify-design-fusion-legacy.mjs` 的 P4 规则改为：所有 `modalQueue.getZIndex('...')` 字面量必须有同名 `id` 或 `data-modal-id` 根节点；删除 visibility map 反推分支。
- `AppConfirmModal` 根节点补 `data-modal-id="app-confirm"`。
- 删除临时调试脚本 `scripts/debug-modal-contract.mjs`。

#### 观察项（非设计融合缺陷）

- Toast service 消费面窄：当前仅 `AiNamingModal` 使用 `toast.success('已复制到剪贴板')`；其余大量操作结果仍走 `appConfirm.alert`。旧三套 toast 实现（DOM/notyf/内联）已清零，所以这是交互语义迁移，不是“做新去旧”未完成；列入后续产品级交互迁移，不在本轮混改。

#### 第4轮验证

- `node scripts/verify-design-fusion-legacy.mjs --phase=P5`：PASS，0 non-whitelisted legacy findings。
- `node --check scripts/verify-design-fusion-legacy.mjs`：exit 0。
- `npm run type-check`：exit 0。
- `npm run test:services`：73 files / 706 tests 全过。
- `node scripts/verify-app-confirm-layering.mjs`：PASS，`overlayZ 9000 > outlineZ 3000`，Escape 只关闭确认层；末尾 profile 清理为既有 Windows EPERM 警告，进程 exit 0。

### 第6轮：密度视觉矩阵根因

#### 新发现

- 视觉矩阵中 `dark default / comfortable / compact` 三张 1440px 截图 SHA256 完全相同，说明密度切换没有产生视觉差异。
- 根因在 `src/styles/tokens.css`：三个 `[data-density="..."]` 规则块被嵌在 `:root` 声明块内部。构建后的 CSS 中没有任何 `data-density` 选择器，Vite/LightningCSS 静默丢弃了这段非法嵌套内容，因此三档 token 从未进入产物。
- 4173 端口存在残留的 `vite preview --host 127.0.0.1 --port 4173` 进程（PID 15900，命令行确认属于本仓库），阻塞视觉矩阵脚本；已确认后结束该残留进程。

#### 修复

- `src/styles/tokens.css` 的三档密度规则移出 `:root`，改为 `:root[data-density="default"]`、`:root[data-density="comfortable"]`、`:root[data-density="compact"]`，明确锚定 `document.documentElement`，并保留原有 token 值。
- 新增 `scripts/verify-design-fusion-visual-matrix.mjs`：启动 Vite preview，覆盖主题、密度、响应式视口 6 个组合，要求截图非空且 SHA256 全部不同，结果写入 `_audit/verification-design-fusion-visual-matrix/result.json`。
- `src/components/chat/ChatPanel.vue` 的 `26px/28px` 写死控件高度改为 `--density-form-height`、`--density-form-padding`、`--density-btn-sm-height`。

#### 第6轮验证

- `npm run build:vue`：exit 0，主应用与 protocols 双构建成功，主 CSS 产物更新为 `index-D27_7Lr7.css`。
- `node scripts/verify-design-fusion-visual-matrix.mjs`：PASS，6 张截图非空且互不相同；密度 hash 从同一值变为 `4a9bbe6f459e` / `9510dda491e4` / `5b727aafd036`。

### 第7轮：主题单源与验证器递深反查

#### 新发现

- `AppearanceSettings.vue` 存在主题旁路：打开面板时用 `classList.contains('dark-theme')` 判断主题，但 `theme.ts` 单源只维护 `light-theme`，暗色主题下控件会显示为亮色；保存路径写 `theme_dark`，也和单源 key `app-theme`/`wa-theme` 不一致。
- 视觉矩阵只覆盖 `dark × comfortable/compact`，缺 light 主题下的密度交叉。
- 只比较截图 SHA256 可能误判密度是否生效，缺 computed token / 控件实际高度断言。
- 视觉矩阵脚本在 Windows 用 `shell: true` 启动 `npx.cmd`，`child.kill()` 只杀 shell 包装层，Vite preview node 进程残留并占用 4173；第6轮结束后的 PID 20524 就是该泄漏产物。

#### 修复

- `AppearanceSettings.vue` 引入并使用 `themeStore.setTheme()`；删除 `dark-theme`、`theme_dark` 与直接 class 操作，当前值从 `themeStore.theme` 读取，下拉与开关共用同一提交函数。
- 视觉矩阵从 6 组扩到 8 组，补 `light comfortable/compact`；每个用例断言 root density、body theme、`--density-form-height`、`--density-btn-md-height`，并在 `#co-skill-select` 存在时断言实际渲染高度。
- 脚本改为 `spawn(process.execPath, [node_modules/vite/bin/vite.js, ...])`，去掉 shell 包装，确保 `child.kill()` 结束真实 Vite 进程。

#### 第7轮验证

- `node --check scripts/verify-design-fusion-visual-matrix.mjs`：exit 0。
- `rg "dark-theme|theme_dark|classList\\.(add|remove)\\('light-theme'\\)|setTheme\\(" src`：仅剩 `src/stores/theme.ts:24,26,36` 单源实现与 `AppearanceSettings.vue:178` 调用，旁路为 0。
- `npm run build:vue`：exit 0，主应用与 protocols 双构建成功。
- `node scripts/verify-design-fusion-visual-matrix.mjs`：PASS，8 张截图非空且互不相同；light 密度 hash 为 `c8b9de8d3acb` / `0b1371ad58a0`，且密度 token 断言通过。

### 第8轮：持久化与恢复反查（零新问题）

#### 反查

- 主题持久化：Electron 走 `wa_app-theme`，浏览器走 `wa-theme`；读写两侧对称，`AppearanceSettings` 已通过 `themeStore` 调用同一路径。
- 密度持久化：`themeStore.init()` 与 `AppearanceSettings` 均读写 `wa-density`，仅浏览器 localStorage 域持久化，读写对称。
- 反查 `src electron preload.js tests` 中 `app-theme / wa-theme / wa-density / data-density`：无旧 key 消费者、无第三方写入者、无 Electron/localStorage 混写路径。
- 密度恢复值经过 `default / comfortable / compact` 白名单校验，非法值回落 `default`。
- `storageKey()` 只负责 Electron `wa_` 前缀归一，主题在浏览器路径不使用该前缀 helper，属于两个存储域的既有约定，不构成旁路。

#### 结论

- 本轮未发现新问题，作为 20 轮反查的零新问题停止轮；按“直到一轮没有新问题即可停止”的门禁收尾。

### 第9轮：交互控件高度未统一点反查

#### 新发现

- 第8轮停止后复查发现旧扫描器仍有一类盲区：交互控件高度写死 26/28/30/34px，绕过 `--density-*` token。
- 交互控件：`DiagLogPanel`（下拉/搜索 26px）、`AppearanceSettings`（下拉/输入 34px）、`PluginMarket`（token 输入/搜索/下拉 28px）、`ApiSettings`（输入 34px、卡片按钮 30px）、`AgentSettings`（输入 34px）、`TimelineView`（筛选/下拉 30px）、`OutlineWorkspace`（下拉 28px、查找输入 30px、消息按钮 28px）、`ChatMessage`（消息按钮 30px）、`DeAiSettings`（按钮 30px）、`HelpGuide`（导航按钮 34px、关闭/确认 32px）、`PipelinePanel`（输入/下拉 34px、条形按钮/关闭 28px、分类项 34px）。
- `--input-height: 34px` 定义存在但无消费者，属于“旧 token 与 `--density-form-height` 并存”的未统一点。
- `--panel-header-height` 定义存在但无消费者。
- `.nav-btn` 是死选择器（组件实际类为 `.sidebar-btn`）。
- `AiNamingModal` 步进器 32px 与局部 `.btn` 32px、`PipelinePanel .pl-input` 36px、`EditorPanel .find-input` 24px 同属交互控件高度旁路。

#### 修复

- 表单/下拉/搜索/输入统一 `var(--density-form-height)`。
- 文本按钮统一 `var(--density-btn-sm-height)`；中等按钮/步进器/确认按钮统一 `var(--density-btn-md-height)`。
- 方形图标按钮统一 `var(--density-btn-xs-height)`。
- 初始扫描规则误把模板片段当选择器，修正为只在 `<style>` 块内解析 CSS 规则；并用 `SidebarNav` 已知写死高度完成规则自测。
- 删除无消费者的 `--input-height` 定义；`--panel-header-height` 改由 `.panel-header` 消费。
- 删除死选择器 `.nav-btn` 的两处响应式覆盖。
- 扫描器新增 P5 规则：扫描交互控件选择器中 `height/min-height: 24-38px` 的写死值；`--input-height` 残留为 0。

#### 保留原样的高度（非交互控件）

- 序号圆/徽记/拖拽条/关闭图标按钮等装饰性元素。
- 表头/工具栏/骨架屏等容器高度。
- `AiNamingModal .naming-icon-btn` 与 `modal.css .modal-close` 保持固定小尺寸（紧凑交互图标）。

#### 第9轮验证

- `node scripts/verify-design-fusion-legacy.mjs --phase=P5`：PASS，0 non-whitelisted legacy findings。
- `rg -n "--input-height" src scripts`：仅验证器规则自身 1 处，源码消费者/定义残留为 0。
- `node --check scripts/verify-design-fusion-legacy.mjs`：exit 0。

### 第10轮：清理器递归解析与 tooltip 批量收口

#### 新发现

- `design-fusion-cleanup.mjs` 的 `matchingParen` 从 token 名开始数括号，而不是从 `var(` 的左括号开始，导致嵌套 fallback 解析错位并中断批处理。
- 23 个文件残留主 token fallback；原生 `title` / `:title` 分布在 18 个文件，仍与 `data-tooltip` / `aria-label` 并存。
- 验证器把 `.modal-header h3`、`.shiki span` 等合法后代选择器误判为 invalid compound selector。
- `base-components.css` 的 `.confirm-dialog`、`.card-item:hover`、`.modal-tab.active` 与 `global.css` 的 `.header-selector` 存在重复选择器。

#### 修复

- `matchingParen` 改为从 `var(` 左括号计数；`--fallbacks` 清理 23 个文件，`--tooltips` 分两轮迁移 18 个文件。
- invalid selector 规则加入 HTML 标签白名单；tooltip 规则扩展到静态 `title=` 与动态 `:title=`，且已有 `aria-label` 的 input 不再误报。
- 合并 4 处重复选择器，删除空的 `.modal-tab.active {}` 块。

#### 第10轮验证

- `node scripts/verify-design-fusion-legacy.mjs --phase=P5`：PASS，0 findings。
- `node scripts/audit-design-tokens.mjs`：defined=276 referenced=278，DEAD=0，UNDEFINED=0。
- `npm run type-check`：exit 0。

### 第11轮：按钮高度双轨与视觉矩阵盲区

#### 新发现

- 视觉矩阵原 8 组未覆盖方案承诺的 375 视口、light 799/1023、布局状态、页面覆盖与 reset-layout。
- `--btn-xs/sm/md/lg-height` 与 `--density-btn-*` 双轨并存：`SettingsModal.vue`、`global.css`、`base-components.css` 共 10 处旧 token 消费。
- 验证器只禁止 `--input-height`，未禁止旧按钮高度 token。
- `--btn-lg-height` 原定义散落在尾部 Missing variables 区，不在基础 token 区。

#### 修复

- `--btn-lg-height: 38px` 移入基础 token 区；10 处旧 token 消费全部改为 `var(--density-btn-*)`。
- `legacyHeightTokens` 升级为同时禁止 `--input-height` 与 `--btn-(xs|sm|md|lg)-height`。
- 视觉矩阵重写为 19 用例：布局状态、页面覆盖、375/799/1023、reset-layout、M28 构建新鲜度；修复 `assertFreshBuild` 只看部分产物与首次导航后 localStorage 未生效两个脚本缺陷。

#### 第11轮验证

- `rg "var\\(--(input|btn-(?:xs|sm|md|lg))-height\\)" src`：仅剩 `tokens.css` 内部 density 别名定义。
- `npm run build:vue`：exit 0，主应用与 protocols 双构建成功。

### 第12轮：响应式格局冲突与 splitter 隐形命中区

#### 新发现

- `global.css` 的 760px 规则把 `.app-main-content > .chapter-tree` 强制恢复为全宽可见，覆盖 `tokens.css` 的 799px 隐藏规则；双断点语义并存导致 799 下章节树仍为 `display: flex`。
- 窄屏隐藏章节树时，`#resizer-chapter` 仍保留 6px 命中区，形成隐形可交互点，违反方案第 8.5 轮第 6 条。
- `tokens.css` 的普通 `.chapter-tree` 特异性低于 `ChapterTree.vue` scoped 规则 `.chapter-tree[data-v-*]`，媒体规则被压住。
- `useResizers.onDragStart` 无视口守卫，程序化触发仍可在隐藏章节树时改写布局状态。

#### 修复

- 删除 760px 里的章节树恢复规则，保留编辑器/Chat 纵向堆叠；799px 统一隐藏章节树与 chapter splitter。
- `.resizer-v` 增加 `--resizer-hit`；799px 下 splitter 命中区归零并禁用 pointer events。
- 隐藏规则改为 `.app-main-content .chapter-tree`，在特异性上压过 scoped 规则。
- `onDragStart` 增加 `(max-width: 799px)` 媒体查询守卫，章节树隐藏时拒绝启动拖拽。

#### 第12轮验证

- `npm run build:vue`：exit 0。
- `node scripts/verify-design-fusion-visual-matrix.mjs`：PASS，19 张截图非空且互不相同；799/375 断言章节树隐藏、splitter `display:none/width:0px`、侧栏 44px。

### 第13轮：门禁自身的规则盲区

#### 新发现

- P3 whitelist 的 `--g6-node-fill|--memory-node-bg` 条目在 P3 迁移完成后仍未删除，成为过期永久豁免。
- `allowedBareOutlineFiles` 是无删除阶段的永久白名单，违反方案 §7 “白名单必须带删除阶段”。
- `global.css` 的 `outline: none` 依赖该永久豁免，未被规则覆盖。

#### 修复

- 删除过期 P3 whitelist 条目，`whitelist = []`。
- 删除 `allowedBareOutlineFiles` 永久豁免。
- `*:focus:not(:focus-visible)` 改为 `outline: 2px solid transparent`，保留非键盘焦点静默，同时消灭裸 `outline: none`。

#### 第13轮验证

- `node scripts/verify-design-fusion-legacy.mjs --phase=P6`：PASS，0 non-whitelisted findings。
- `rg -n -- "--g6-node-fill|--memory-node-bg" src scripts docs _audit`：仅剩 `tokens.css` 现役定义与消费、`audit-design-tokens.mjs` 审计清单、v1/v2 历史方案文本与历史审计证据。

### 第14轮：动态 easing 伪 token 组合

#### 新发现

- `base-components.css` 的 `animation: menuFadeIn var(--duration-fast) var(--ease-standard)-out` 把 `-out` 后缀拼在 token 后，实际渲染为非法 easing，回落浏览器默认。

#### 修复

- 改为现役 `var(--ease-decelerated)` token。

#### 第14轮验证

- `rg -n -- "--ease-(standard|decelerated|accelerated)" src/styles/tokens.css src/styles/base-components.css`：仅剩 token 定义与合法消费。
- `node scripts/verify-design-fusion-legacy.mjs --phase=P6`：PASS。

### 第15-17轮：回头看 + 应用反查 + 递深反查 + 方案核验（零新问题停止轮）

#### 反查

- 原生 `title` / `:title` 命中逐条分类：全部为 `EmptyState` 组件 prop 或 `TopSheet` 组件 prop，不是原生 HTML tooltip；原生 `data-tooltip` / `aria-label` 消费已统一。
- `will-change` 残留为 0；`backdrop-filter` 仅剩 `--overlay-blur` token 消费。
- 组件/服务/组合层硬编码色为 0；颜色值只存在于 `tokens.css` 单源。
- keyframes 仅剩 `wh-spin`、`menuFadeIn`、`modal-spring-in`、`skeleton-shimmer` 四族且全部有现役引用。
- v1 仅作为历史稿保留并自声明 v2 为现役执行稿；现役规格、经验、日志均指向 v2，无旧方案执行引用。
- token 审计：defined=277 referenced=279，DEAD=0，UNDEFINED=0；剩余 em 字号为方案保留的阅读节奏。

#### 全量收尾验证

- `npm run type-check`：exit 0。
- `npm run test:services`：Test Files 73 passed，Tests 706 passed。
- `npm run build:vue`：exit 0，主应用与 protocols 双构建成功，主 CSS 产物更新为 `index-LC9rjI-0.css`。
- `node scripts/verify-design-fusion-legacy.mjs --phase=P6`：PASS，0 non-whitelisted legacy findings。
- `node scripts/verify-design-fusion-visual-matrix.mjs`：PASS，19 张截图非空且互不相同，密度、布局、响应式契约全过。
- `node scripts/verify-app-confirm-layering.mjs`：PASS，确认层 z=9000 高于 outline z=3000，Escape 只关确认层，清空链路真实执行。

### 第10-17轮 DELETE-CHECK 汇总

| 删除对象 | 类别 | 证据 |
|---|---|---|
| 主 token fallback（23 文件） | 可删 | `--fallbacks` 批处理后 legacy P5/P6 0 findings |
| 原生 title tooltip（18 文件） | 可删 | `--tooltips` 批处理后 tooltip 规则 0 findings；剩余 title 为组件 prop |
| `.modal-tab.active {}` 空块 | 可删 | 合并后 selector duplicate 0 findings |
| `--input-height` | 可删 | token audit DEAD=0，legacy 高度规则 0 findings |
| 旧按钮高度消费（10 处） | 可删 | `rg` 仅剩 tokens.css density 别名定义 |
| 760px 章节树恢复规则 | 可删 | 799 视觉用例 `display:none` + screenshot hash 唯一 |
| splitter 常驻 6px 命中区（窄屏） | 慎删，改为条件归零 | 799/375 断言 `display:none` 且 `width:0px` |
| 裸 `outline: none` | 慎删，改为透明 outline | legacy P6 0 findings，focus-visible 规则保留 |
| P3 过期 whitelist 条目 | 可删 | `whitelist = []`，P6 0 findings |
| `allowedBareOutlineFiles` 永久豁免 | 可删 | 扫描器中该变量已不存在 |
| `var(--ease-standard)-out` 伪 token | 可删 | 替换为 `--ease-decelerated` 后无该模式 |
| 常驻 `will-change` | 可删 | `rg "will-change" src` 0 命中 |
| 旧 keyframes | 可删 | 仅剩四族且全有现役引用 |

### 经验回写

- 新增经验规则：验证器规则收窄会重新制造盲区。规则按局部误报收窄时，必须先证明“真实违规形态也被覆盖”；特别是原生标签/属性扫描不能因组件同名 prop 误报就直接排除整个属性，必须区分组件标签与原生标签。
- 历史日志保留不删；v1 方案保留为历史稿，现役执行只指向 v2。