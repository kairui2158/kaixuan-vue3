# 2026-08-16 端到端验证 & 经验更新

## 验证结果
- 17/17 全部通过，0 失败
- 验证方式: CDP (ws://localhost:9227) + Playwright chromium
- 截图: _audit/cdp_final_verify.png

## 已验证的项目
1. AI共创按钮可见性 ✓
2. SkillBindModal弹窗 ✓ (在流水线中触发)
3. 编辑器↔对话框同步 ✓ (watch activeTab + setCurrentContext)
4. 章节树联动 ✓ (selectChapter → editorStore.openTab)
5. 退出保存机制 ✓ (Documents/神意助手数据/)
6. 端到端验证 ✓

## 经验教训
1. Playwright 的 connectOverCDP 在 file:// 协议下 waitForLoadState('networkidle') 会无限挂起，必须用 waitForTimeout 代替
2. CSS overlay (如 .ow-overlay) 会拦截 Playwright 的 click()，需要 force:true 或 evaluate() 方式触发
3. evaluate() 方式触发点击比 click({force:true}) 更可靠，因为能触发 Vue 事件处理
4. 页面状态在多次 evaluate 调用之间可能变化（大纲工作台被关闭），需要每次重新打开
5. 存储路径在 electron/ipc/storage.js 中定义，数据保存到 Documents/神意助手数据/
