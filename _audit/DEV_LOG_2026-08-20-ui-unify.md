## UI 统一与字号修正 (2026-08-20)

### 背景

用户反馈记忆面板四视图 tab 挤压，截图后确认 5 个 tab flex:1 + gap:8px 在 1856px 宽度下每个 tab 324px，但字号只有 12px，header 高度 44px。同时全局 tokens.css 字号过小（body=13px、btn=32px）。结合社区学习经验（Cloudscape/Carbon/Blueprint/Naive UI/Element Plus/Radix UI），进行统一修正。

### 变更清单

| 文件 | 变更 | CDP 实测 |
|------|------|----------|
| src/styles/tokens.css | --font-size-xxs 10→11、xs 11→12、sm 12→13、md 13→14、lg 15→16 | tabFS: 14px ✓ |
| src/styles/tokens.css | --font-size(var) 从 sm→md，--font-size-editor 14→16 | editorFS: 16px ✓ |
| src/styles/tokens.css | body font-size 14→15px | bodyFS: 15px ✓ |
| src/styles/tokens.css | --btn-md-height 32→34、--btn-sm-height 28→30 | btnMdH: 34px ✓ |
| src/styles/tokens.css | 移除 3 处 clamp() 响应式字号，改为固定 px | 消除缩放歧义 |
| src/components/common/MemoryPanel.vue | header 高度 44→48px、tab padding 22→24px、字号 sm→md、gap 8→6px | headerH: 48px、tabH: 40px ✓ |
| src/components/common/MemoryPanel.vue | h4 增加 white-space:nowrap + flex-shrink:0 | 防止标题挤压 |
| src/components/common/MemoryPanel.vue | more-btn 和 dropdown 字号 sm→md、padding 增大 | 可读性提升 |
| src/components/pipeline/PipelinePanel.vue | pl-content 宽度 1200→1400px | 面板更宽 |
| src/components/pipeline/PipelinePanel.vue | pl-content-right padding 16px→24px（左右对称） | 内容不再紧贴边缘 |
| src/components/pipeline/PipelinePanel.vue | pl-steps 宽度 180-240→200-280px、gap 4→6px | 步骤栏更宽敞 |
| _audit/神意开发经验总结.md | 新增 K1-K4 UI 经验条目 + 社区学习摘要 | 经验积累 |
| docs/UI设计经验总结_社区学习提取.md | 已有社区学习文档（前序会话产出） | 参考 |

### CDP 验证证据

构建通过 → 杀进程 → start-electron.bat → CDP 9227 连接成功

```
STEP1: CLICKED
STEP2: {"panelExists":true,"panelWidth":1856,"panelHeight":975,
"tabCount":5,"tabWidths":[322,322,322,322,322],
"tabHeights":[40,40,40,40,40],"tabFS":"14px","tabPadding":"10px 24px",
"bodyFS":"15px","btnMdH":"34px","contentH":927,"sidebarW":160}
```

### 铁律执行

- ✓ 任务前读取经验文件
- ✓ 一次只修一个闭环（本次=UI 字号与间距统一）
- ✓ 先删旧规格再写新规格
- ✓ 构建 → 杀进程 → start-electron.bat → CDP 验证
- ✓ 临时脚本已清理（_tmp_*、_tmp_read.js 均已删除）
- ✓ 经验文件已更新
- ✓ 开发日志已更新
- ⏳ Git 提交待执行

### 编辑器顶层与导航栏修复

用户反馈主页面编辑器顶层文字溢出边框。CDP 实测发现：
- editor-header 高度 48px，toolbar 内容 scrollWidth=620 > offsetWidth=508，溢出
- editor-toolbar 没有 overflow-y:hidden，导致高度撑到 53px
- app-header 下拉选择器文字溢出
- breadcrumb 字号 12px 过小

修复：
- editor-header 48->56px、gap 8->12px、padding 12->16px
- editor-title flex:1->flex:0 1 auto + max-width:200px（给 toolbar 让空间）
- editor-toolbar 加 overflow-y:hidden + min-width:0
- toolbar-group gap 4->6px + flex-shrink:0
- sep height 16->20px + flex-shrink:0
- app-header 48->56px、padding 12->16px
- header-selector 加 max-width:140px + overflow:hidden + text-overflow:ellipsis
- breadcrumb padding 4px 12px->6px 16px、字号 sm->md、加 overflow:hidden

CDP 复测：editorHeader h=56px、toolbar w=972px scrollW=972（无溢出）、所有 group 高度 30px 统一。

### 下一步

Git 提交并推送本次变更。
