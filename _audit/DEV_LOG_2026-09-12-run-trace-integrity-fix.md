# 2026-09-12 运行记录完整性修复日志

## 项目功能

修复大纲工作台 folder SKILL 深度运行记录中的三类记录缺陷，并交付 3.37.2 Windows NSIS 安装包。

## 用途

- 让用户取消、失败、迟到回调产生的 API 调用状态如实落盘，不再出现 `canceled` 被迟到 `success` 覆盖。
- 完整记录工具调用多轮物理请求，SKILL 调试方能看到第 2、3 次迭代的请求内容。
- 让 folder 技能失败结果在运行记录中如实标记为 `failed`，并携带错误信息。
- 续生成取消后，turn 状态不再被 finally 的收尾调用改写。

## 根因

1. `runTrace.finishApiCall` 允许已结束调用被再次写入，取消清扫后迟到的成功回调会把 `canceled` 翻案成 `success`。
2. `aiService.callAiWithTools` 只在工具迭代内部持有逐轮请求，`realSkillExecutor` 只捕获首轮请求，后续物理请求没有进入 `apiMeta`。
3. 大纲工作台 `onApiCallFinish` 无条件写 `success`，未读取 `result.status`。
4. 大纲/续生成链路缺少取消时的 running 调用清扫，异常路径会留下永久 `running` 僵尸记录。

## 修改文件

- `src/services/aiService.ts`：`CallAiResult` 新增 `toolRequests`，工具迭代逐轮收集物理请求。
- `src/services/realSkillTypes.ts` / `src/services/realSkillExecutor.ts`：`apiMeta` 新增 `toolRequests`，统一捕获首轮与工具迭代请求。
- `src/services/workspaceSkillEngine.ts`：folder 元数据透传 `toolRequests` 到工作台运行记录。
- `src/components/common/OutlineWorkspace.vue`：失败结果写 `failed`；取消/失败时清扫 running API 调用；收尾兜底清扫未闭合调用。
- `src/stores/runTrace.ts`：新增 `cancelRunningApiCalls`；`finishApiCall` 增加终态保护。
- `src/stores/runTrace.spec.ts`：新增取消终态保护回归测试。
- `src/services/realSkillExecutor.spec.ts`：新增工具多轮请求捕获回归测试。

## 验证结果

- `npx vitest run src/stores/runTrace.spec.ts src/services/realSkillExecutor.spec.ts`：2 个文件、41 个测试通过。
- `npm run test:services`：20 个文件、221 个测试通过。
- `npm run type-check`：通过。
- `npm run build:vue`：通过。

## 交付

- 版本：3.37.2
- 安装包：`dist/神意助手-Setup-3.37.2.exe`
- 体积：128.69 MB（134,938,344 bytes）
- SHA256：`EB9DA9B0DAE3A7992E85B9F02E1C3AD0AFE15D3F87A24C6DC0ECA3E406DF4EDF`
- Blockmap：`dist/神意助手-Setup-3.37.2.exe.blockmap`
- `dist/latest.yml`：version 已同步为 3.37.2。
- NSIS 配置核验：`dist/builder-effective-config.yaml` 中 `oneClick: false`、`allowToChangeInstallationDirectory: true`、`include: build/installer.nsh` 均存在，安装时可选择安装路径。
- 安装包版本核验：EXE `VersionInfo.ProductVersion` / `FileVersion` 均为 3.37.2；解包后 asar 内 `package.json` 的 `name` 为 `shenyi-assistant`、`version` 为 3.37.2。
- 安装包未签名。
- 客户实操入口：大纲工作台运行记录面板，导出 JSON 后检查 API 调用状态、取消原因与工具多轮物理请求。

## 未验证项

- 未做真实供应商 API 的取消场景实操；本轮以单元测试、服务测试、类型检查、构建和安装包配置核验交付。
