# 2026-09-17 · 3.52.3 版本封装

## 交付目的

发布 tool convergence 双层取消信号修复：收敛救援请求继承用户取消能力，但不继承工具监督器的逻辑 deadline；工具执行阶段同时响应两类取消信号，避免用户在收敛阶段失去取消能力。

## 版本与产物

- `package.json` / `package-lock.json` 版本：`3.52.3`
- 安装包：`dist/神意助手-Setup-3.52.3.exe`
- 大小：`129,838,926` bytes
- SHA256：`21D0AD6B39774F08D02F3A795DFC385CE2B6BFD97876DFB07EF912D72AAF5781`
- asar 内 `package.json` 版本：`3.52.3`
- NSIS 配置：`oneClick: false`，`allowToChangeInstallationDirectory: true`，安装路径可选能力保留

## 验证

- `npm run type-check`：通过
- `npm run test:services`：71 个文件 / 633 个测试全部通过
- `npm run build`：通过并生成上述 NSIS 安装包
- asar 版本读取：`dist/win-unpacked/resources/app.asar` 内版本为 `3.52.3`
- 安装包哈希：`Get-FileHash` 重新计算为上述 SHA256

## 封装前回头看

- 全仓 `callAi(` 对账：本次新增 `cancelSignal` 为可选参数，未接该参数的入口按 `params.cancelSignal ?? params.signal` fallback，保持原有取消语义。
- `toolRunSupervisor` 生产调用点仅大纲 direct 对话一处；收敛开始时显式 `dispose()`，不再形成第二混合信号入口。
- `cancelController` 与 `generationController` 同点创建、finally 同点清空；用户取消入口同时 abort 两个 controller，无残留引用。
- `useDeAi.ts` 中的 `cancelController` 是本地独立实现，与本次服务层协议无关。

## 客户验证重点

1. 在大纲工作台 direct 对话中触发工具调用上限，确认能看到“开始收敛最终回答”状态并最终得到正文。
2. 收敛等待期间点击取消，确认请求能停止且状态不显示为成功。
3. 安装时确认仍可选择自定义安装目录。

## 备注

- 本轮仅做发布收尾与日志补记，未修改运行时代码。
- 未执行安装包运行时 smoke test；如需要，可参考现有 `verify-installer-*-smoke.mjs` 脚本适配 3.52.3。
