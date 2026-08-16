# 深度差异扫描报告 - 旧架构 vs Vue3新架构

**日期**: 2026-08-12
**扫描方法**: 逐文件行为契约对账 + 代码语义分析 + Playwright E2E验证

## 修复总结 (6/6 FIX完成)

| FIX | 文件 | 问题 | 修复方案 | 状态 | 语法验证 |
|-----|------|------|----------|------|----------|
| FIX1 | electron/main.js | 缺窗口状态持久化（位置/大小/最大化） | 加getWindowStatePath/loadWindowState/saveWindowState + ready-to-show + resize/move/close事件 + before-quit | DONE | PASS |
| FIX2 | electron/ipc/crypto.js | encrypt不加enc:前缀，旧数据无法解密 | encrypt加enc:前缀，decrypt检查indexOf(enc:)===0 | DONE (前轮) | PASS |
| FIX3 | src/stores/provider.ts | loadProviders/saveProviders未加解密apiKey | loadProviders两分支加decrypt循环，saveProviders加encrypt深拷贝 | DONE (前轮) | PASS |
| FIX4 | electron/ipc/storage.js | legacy fallback路径双wa_前缀(wa_wa_) | 去掉legacy路径的wa_前缀，直接用传入key | DONE | PASS |
| FIX5 | electron/ipc/dialog.js | dialog:saveFile/openFile缺title参数 | saveFile加title:导出配置，openFile加title:导入配置 | DONE | PASS |
| FIX6 | src/services/diag.js | DiagLogger引用不存在的StorageManager/SkillManager | 替换为window.electronAPI.storageRead/storageWrite + storageKey前缀 | DONE | PASS |

## 死代码识别

旧架构services/*.js文件在新架构中未被任何Vue组件或TS文件导入：

| 文件 | 引用StorageManager次数 | 新架构是否使用 | 处置 |
|------|----------------------|----------------|------|
| services/storage.js | 14处 | 否（Vue3 stores用storageKey+electronAPI） | 死代码，保留但不加载 |
| services/agent-manager.js | 4处 | 否（stores/agent.ts替代） | 死代码 |
| services/chapter-manager.js | 2处 | 否（stores/chapter.ts替代） | 死代码 |
| services/project-manager.js | 8处 | 否（stores/project.ts替代） | 死代码 |
| services/skill-manager.js | 4处 | 否（stores/skill.ts替代） | 死代码 |
| services/provider-manager.js | 10处 | 否（stores/provider.ts替代） | 死代码 |

**结论**: 所有services/*.js文件是旧架构遗留死代码，不会在Vue3运行时执行，不需要修复其中的StorageManager引用。

## Playwright E2E验证结果

| 测试项 | 状态 | 详情 |
|--------|------|------|
| V1-PageLoad | PASS | title=Novel Workshop |
| V2-AllButtons | PASS | 30个按钮可见 |
| V3-AppMount | PASS | #app挂载正常 |
| V4-ElectronAPI | PASS | electronAPI可用（polyfill模式） |
| V5-StorageRoundTrip | PASS | 写入/读取/删除循环成功 |
| V6-NoGarbledText | PASS | 无乱码 |
| V7-NavButtonsFound | PASS | 生成/项目/树生成/+卷/保存/导出/去AI味等按钮可见 |
| V8-Click-生成 | PASS | 点击后11个overlay元素出现 |
| V9-NoJSErrors | PASS | 0个控制台错误 |

截图: _audit/v01-initial-load.png, _audit/v09-final.png

## 行为契约差异分析（补充维度）

### 1. 窗口持久化 (FIX1已修)
- 旧: main.js有完整getWindowStatePath/loadWindowState/saveWindowState + close/resize/move/before-quit事件
- 新: 完全缺失，每次打开固定1400x900
- **修复后**: 新架构已对齐旧架构行为

### 2. 退出确认机制
- 旧: main.js close事件preventDefault → 发送app:requestClose → 监听app:closeChoice(0=save+exit/1=direct/2=cancel) → app:finalSave
- 新: lifecycle.js已有完整实现：close → preventDefault → app:requestClose → app:closeChoice(quit/force-quit/cancel) → app:finalSave
- **状态**: 已对齐，ExitConfirmModal.vue + useExitConfirm.ts + App.vue完整链路

### 3. 自动保存
- 旧: EditorPanel._startAutoSaveTimer() → setInterval(autoSave, 30000) + beforeunload → autoSave
- 新: EditorPanel.vue L290 startAutoSave() → setInterval(autoSave, settings.autoSaveInterval*1000) + onUnmounted清理 + App.vue L335 beforeunload
- **状态**: 已对齐，且新架构支持用户自定义间隔

### 4. API Key加密
- 旧: main.js safe:encrypt → enc:base64, safe:decrypt → 解enc:前缀
- 新: crypto.js FIX2已修 + provider.ts FIX3已修
- **状态**: 已对齐

### 5. 存储迁移
- 旧: StorageManager.migrate() 从localStorage迁移到文件存储
- 新: storage.js legacy fallback路径（FIX4已修双前缀）+ Vue3 stores直接用storageKey+electronAPI
- **状态**: 已对齐

### 6. 诊断日志
- 旧: renderer_v2.js DiagLogger + main.js diag:write/read/export/clear IPC
- 新: diag.js FIX6已修（替换StorageManager为electronAPI）+ ipc/diag.js IPC + LogIndicator/LogToast组件
- **状态**: 已对齐

### 7. 去AI味流程
- 旧: deAiProcess() chain/split-merge/multi-step + hardrule + _applyTextFilter(18个AI词过滤)
- 新: useDeAi.ts chain/split-merge/multi-step + DeAiProcessor + applyTextFilter(已注入L288/L370)
- **状态**: 已对齐，执行顺序已修正(S1先跑→硬规则→S2→安全网)

### 8. 供应商管理
- 旧: ProviderManager单例 + localStorage迁移 + encrypt/decrypt
- 新: stores/provider.ts + storageKey+electronAPI + FIX3加解密 + purpose字段(generate/verify/detect)
- **状态**: 已对齐，新架构支持多供应商并行

### 9. 生成流水线
- 旧: 5层流水线(大纲→设定→卷纲→章节→正文) + SKILL链式调用 + 断网续接
- 新: stores/ + usePipeline + SkillExecutionEngine + 断网续接机制
- **状态**: 已对齐（前轮37/37 PASS验证）

### 10. 章节树交互
- 旧: 右键菜单/拖拽排序/双击重命名/卷编辑模态框
- 新: ChapterTree.vue完整实现（前轮48/48 PASS验证）
- **状态**: 已对齐

## 遗留风险

1. services/*.js死代码文件仍在src/services/目录中，虽然不会被导入执行，但可能造成混淆
2. diag.js的checkSkillConfig函数现在通过electronAPI.storageRead读取skills数据，在Electron生产环境外（纯浏览器dev模式）依赖main.ts polyfill
3. Playwright E2E在dev模式（polyfill）下验证，生产Electron环境的IPC通道需要单独验证

## 下一步建议

1. 可选: 清理services/*.js死代码文件（agent-manager.js/chapter-manager.js/project-manager.js/skill-manager.js/provider-manager.js/storage.js）
2. 生产环境Electron打包后需重新验证IPC通道（crypto/storage/dialog/lifecycle/diag）
3. 窗口持久化在Electron生产环境验证（dev模式下使用浏览器无此功能）