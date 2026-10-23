# 2026-10-24 流水线并行 V3.3 收口

## 目标

按已批准的 V3.3 方案与 2026-10-23 收口台账继续执行，完成剩余 P0/P1/P2 缺口、3.104.0 封装核验、旧产物清理、日志回写与 git 收尾。

## 范围

- P0-1：四格再入矩阵完整闭环（fresh start、成功终态再入、取消隔离、断点恢复、失败终态后再入）。
- P0-5：StyleProfileCard 不再读取 runTrace current 指针，观测对象改为显式 task run。
- P1-6：取消全部改为 registry 单源 `cancelAllActiveRuns()`。
- P1-7：provider 排队原因 UI 与 trace 同源，运行中心可见。
- P1-10：pipeline 旧全局执行态清零，仅保留 registry 派生语义。
- P2-11：版本升级、构建、NSIS/asar、SHA256、真实启动核验与旧产物清理。

## 验证

```text
npx vitest run src/services/pipelineProgressReaders.spec.ts src/services/pipelineParallelismPhase0.spec.ts
→ Test Files 2 passed (2), Tests 31 passed (31)

npx vue-tsc --noEmit -p tsconfig.json
→ exit 0

npm run build:vue
→ exit 0

npm run build
→ exit 0，NSIS 打包完成

node scripts/verify-packaging-3-104-0.mjs
→ ===== PACKAGING 3.104.0 VERIFICATION PASSED =====
→ rendererFiles=81；electronAPI methods=77
```

## 交付

- 安装包：`dist/神意助手-Setup-3.104.0.exe`，231,562,775 bytes。
- SHA256：`8ce409b0e017dc3b3fd45088681f7dc81a2e8403c479124bdab6c38ea601929`。
- asar：`dist/win-unpacked/resources/app.asar`，241,453,760 bytes。
- 封装证据：`_audit/verification-packaging-3-104-0/packaging-evidence.json`。
- 并行矩阵证据：`_audit/verification-pipeline-parallelism-live/report.json`（mock 故障注入五项全覆盖）与 `_audit/verification-pipeline-parallelism-live-supplier/report.json`（内置 key 真实供应商）。

## 清理

- 删除 3.103.0 安装包与 blockmap、3.103 核验脚本与证据目录。
- 删除 `_audit` 下的 5 个临时 vitest/electron 日志。
- dist 仅保留 3.104.0 安装包与 blockmap。

## 诚实边界

- mock 矩阵用于断点恢复与失败终态再入的故障注入验证；真实供应商矩阵覆盖三层并发、取消隔离与成功终态再入。两者互补，不互相冒充。
- 3.104.0 封装核验使用真实 packaged Electron 启动，不是静态检查。
- git 分类提交与最终工作区状态见台账 P2-12；提交前不以本文件宣称仓库已收口。
