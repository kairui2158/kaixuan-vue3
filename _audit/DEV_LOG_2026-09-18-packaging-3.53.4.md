# DEV LOG 2026-09-18 神意助手 3.53.4 封装交付

## 封装范围

- 基线：3.53.3 后的当前工作区，包含编辑器重复写入守卫第 1-5 轮修复与第 6 轮无新发现的收口。
- 核心修复：删除写入次数预算，改为“连续 3 次完全相同写入输入”守卫；兼容 JSON 直写路径接入同一守卫并加 100 scope LRU 淘汰；physical call 失败态修正；重复拦截事件进入 runTrace 与诊断日志。
- 版本号从 `3.53.3` 升至 `3.53.4`，同步 `package-lock.json` 根记录。

## 封装前验证

1. `npm install --package-lock-only`：lockfile 同步完成，无依赖变更。
2. `npm run type-check`：通过，0 错误。
3. `npm run evaluate:chain-intent`：classification 20/20，routing 20/20。
4. `npm run verify:phrase-corpus-sync`：1642/1642 phrases，249/249 samples，0 problems。
5. `npm run test:services`：71 个测试文件 / 649 个用例全部通过。

## 构建与封装

1. `npm run build`：renderer 1642 modules 构建成功，protocol bundle 生成；electron-builder 25.1.8 完成 NSIS x64 封装。
2. 安装包：`dist/神意助手-Setup-3.53.4.exe`，大小 129,846,992 bytes，时间 2026-09-18 05:10:22。

## 产物核验

1. asar 内 `package.json`：`name=shenyi-assistant`，`version=3.53.4`，`main=electron/main.js`。
2. asar 内 renderer 主 bundle 包含本轮修复标记：`duplicate_write_blocked`、`write-duplicate-blocked`、`onRepeatedWriteBlocked`，证明重复写入守卫已进入最终产物。
3. `dist/builder-effective-config.yaml`：`oneClick: false`，`allowToChangeInstallationDirectory: true`，`include: build/installer.nsh`，安装路径选择配置完整。
4. 构建新鲜度：renderer 主 bundle 时间 2026-09-18 05:09:12，新于全部 src 源文件（最新 04:44:16），满足 M28。
5. 未配置代码签名证书，electron-builder 跳过签名；客户首次安装仍可能出现系统提示。

## 封装后清理

1. 已删除旧产物：`dist/神意助手-Setup-3.53.3.exe`、`dist/神意助手-Setup-3.53.3.exe.blockmap`。
2. 复核 `dist`：仅保留 `神意助手-Setup-3.53.4.exe` 与其 blockmap，满足 M29。

## 客户实操入口

1. 安装 `dist/神意助手-Setup-3.53.4.exe`。
2. 在大纲工作台或主页 API 对话中让模型连续提交 3 次完全相同的写入，第 3 次应被拦截并提示 `duplicate_write_blocked`。
3. 打开运行记录，应看到 `write-duplicate-blocked` warn 事件，诊断日志中对应工具请求也有记录。
