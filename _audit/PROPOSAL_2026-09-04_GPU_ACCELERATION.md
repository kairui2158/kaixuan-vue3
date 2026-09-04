# GPU 硬件加速恢复 + CSS 渲染优化方案

> 版本：v1.0
> 日期：2026-09-04
> 引用：开发经验 V2 §1 M1-M3 / §5 规则 1-16 / §8 规则 59

---

## 背景

客户反馈应用运行有迟滞感，鼠标移动和选项点击时明显顿挫不流畅。客户硬件充足。

根因：electron/main.js:14 硬编码 app.disableHardwareAcceleration = true + --disable-gpu，完全关闭了 GPU 渲染管线。注释写反（写着 Enable GPU），实际是禁用。所有 CSS transition/box-shadow/backdrop-filter/animation 全部由 CPU 软件光栅化逐帧计算。

社区对比：VSCode/Slack/Discord/Notion 无一默认关闭 GPU 加速。VSCode #15211 是用户主动要求给我一个关闭选项，不是默认关。Electron #32317/#43955 的 GPU 崩溃只在少数设备上出现，社区做法是用户级降级 --disable-gpu-compositing，不是全局 --disable-gpu。

## 影响圈声明（§1 M1）

| 改动文件 | 改什么 | 可能影响 |
|---------|--------|---------|
| electron/main.js | 移除 disableHardwareAcceleration + disable-gpu | 渲染管线从 CPU 软件切换到 GPU 合成 |
| src/styles/base-components.css | 高频交互元素加 will-change | hover/transition 性能 |
| src/styles/global.css | 高频交互元素加 will-change + contain | 滚动/hover 性能 |
| src/styles/tokens.css | 补 will-change token 变量 | 变量一致性 |

不碰的文件：所有 Vue 组件、store、service 层、preload、IPC handler。

## 执行计划

### P0: 移除 GPU 禁用配置

文件：electron/main.js L13-L16

当前代码：
- app.disableHardwareAcceleration = true
- app.commandLine.appendSwitch('disable-gpu')
- app.commandLine.appendSwitch('no-sandbox')
- app.commandLine.appendSwitch('remote-allow-origins', '*')

改为：
- 保留 app.commandLine.appendSwitch('no-sandbox')
- 保留 app.commandLine.appendSwitch('remote-allow-origins', '*')
- 删除 disableHardwareAcceleration 和 disable-gpu 两行
- 修正注释为 GPU hardware acceleration enabled by default

验证：npm run build:vue 构建通过，无语法错误。

### P1: tokens.css 补 will-change 和 contain 变量

文件：src/styles/tokens.css

新增（只追加，不改现有变量）：
- --will-change-transform: transform
- --will-change-opacity: opacity
- --contain-layout: layout style paint

验证：构建通过。

### P2: base-components.css 高频交互元素优化

文件：src/styles/base-components.css

改动项（只追加一个 CSS 属性，不改选择器/布局/颜色/间距）：
1. .btn 加 will-change: transform（按钮 hover 高频触发）
2. .card-item 加 will-change: transform（卡片 hover 高频触发）
3. .panel 加 contain: var(--contain-layout)（面板布局隔离）
4. .panel-overlay 加 will-change: opacity（遮罩淡入淡出）
5. .loading-overlay 加 will-change: opacity（加载遮罩）

验证：构建通过。

### P3: global.css 高频交互元素优化

文件：src/styles/global.css

改动项（只追加属性，不改选择器/布局/颜色/间距）：
1. .pl-card 加 will-change: transform（流水线卡片 hover）
2. .statusbar 加 contain: var(--contain-layout)（状态栏布局隔离）
3. 滚动容器补 contain: layout style（已有 overflow:hidden 的滚动根）

不改动 @keyframes、不删除任何 transition、不改任何颜色。

验证：构建通过。

### P4: 构建验证

执行 npm run build:vue，确认 0 errors。

### P5: 源 Electron 启动验证

经验引用：§2 规则 18（源 Electron 启动路径）、§3 规则 17（改动后必须 build:vue）

步骤：
1. npm run build:vue 重建 dist-renderer
2. 杀掉所有残留 Electron 进程
3. node_modules\electron\dist\electron.exe . --remote-debugging-port=9227 启动
4. 等待 8 秒
5. 确认窗口可见、无 GPU 崩溃日志
6. CDP 连接，检查 console 无报错
7. 截图确认 UI 渲染正常

验证标准：
- 进程启动无 crash
- console 无 GPU 相关错误
- 页面渲染正常，不黑屏
- 鼠标 hover 按钮有 transition 效果

### P6: 安装包封装

经验引用：§6 交付纪律

1. 升级版本号到 v3.19.4
2. npm run build 生成 NSIS 安装器
3. 清理旧版安装包（只保留最新）
4. 清理临时脚本

### P7: 经验文件和开发日志更新

经验文件新增规则：
- 规则 64: disableHardwareAcceleration 生产代码禁留调试配置。注释与代码语义必须一致。CDP 调试时禁用的 GPU 配置必须在调试后移除或改为用户级降级选项。
- 规则 65: 高频交互元素（按钮/卡片/面板）应加 will-change 提示 GPU 合成层；布局容器加 contain 隔离重排范围。backdrop-filter 在 GPU 加速下开销可忽略，无需移除。

开发日志追加 GPU 加速恢复记录。

## 验收标准

| 检查项 | 标准 | 验证方法 |
|--------|------|---------|
| GPU 加速恢复 | main.js 无 disableHardwareAcceleration | rg 搜索源码 |
| 构建通过 | 0 errors | npm run build:vue |
| 源 Electron 启动 | 无 crash 无 GPU 报错 | CDP console 检查 |
| 页面渲染正常 | 不黑屏 不撕裂 | CDP 截图 |
| hover 动画 | transition 有效果 | CDP 截图对比 |
| 安装包生成 | NSIS exe 存在 | Get-ChildItem dist |
| 经验文件更新 | 规则 64-65 写入 | rg 搜索 |
| 开发日志更新 | GPU 恢复记录追加 | Get-Content 尾部 |
| 工作区干净 | git status 无未提交 | git status --short |

## 风险分析

| 风险 | 概率 | 影响 | 缓解 |
|-----|------|------|------|
| 极少数设备 GPU 驱动崩溃 | 低 | 应用无法启动 | 后续可加用户级降级选项，不全局禁用 |
| will-change 过度使用导致内存增加 | 极低 | GPU 内存多占几 MB | 只加在高频交互元素，非全量 |
| contain 导致子元素 fixed 定位异常 | 低 | 弹窗位置偏移 | 不在弹窗容器上加 contain，只在面板/状态栏加 |

## 不改的东西

- 不删任何 transition / @keyframes / box-shadow / backdrop-filter
- 不改任何颜色 / 字号 / 间距 / 布局
- 不碰任何 Vue 组件 / store / service / preload / IPC
- 不碰 no-sandbox 和 remote-allow-origins
