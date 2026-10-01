# 开发日志：3.54.0 API 直写协议成熟化 V2 封装（2026-09-19）

## 交付目的

将 API 直写协议成熟化 V2 Phase 1-5 封装为 `3.54.0`，交付客户验证协议版本协商、供应商能力矩阵、schema 硬化、工具循环策略单源与四层验证结果。

## 本轮交付内容

1. Phase 1：五供应商工具能力矩阵单源；DeepSeek / Azure 显式继承 OpenAI 形状；Gemini 流式工具调用登记 `unverified`；live 层默认关闭且 key 只经环境变量传入。
2. Phase 2：schema 校验硬化，显式 `undefined` 按缺失处理；深度、循环引用、非法组合结构化失败；folder schema 归一化。
3. Phase 3：协议版本协商；未知版本返回 `unsupported_protocol_version` + 支持列表；缺省版本按 v1 解析并记录 `protocolVersionDefaulted`；native 路径声明顺序修复。
4. Phase 4：`toolLoopPolicy` 四场景单源；入口显式声明 `scenario`；调用方只能收紧不能放宽；`usageUnavailable` 从服务层透传到 runTrace。
5. Phase 5：四层验证收口；经验文件 v5.19 新增 M38 / M39；DEV_LOG 与总索引同步。

## 封装前验证

- `npm run type-check`：通过。
  - 收尾修复 `skillValidation.spec.ts` 非法 schema 负例：用 `as unknown as JsonSchema` 保留负例语义，避免 TS 拒绝故意非法的结构。
- `npm run test:services`：72 文件 / 692 测试全部通过。
- `npm run evaluate:chain-intent`：335 样本饱和语料，analyze / edit / generate / discuss 四类 precision / recall / F1 均为 1.0000。
- 协议仿真：五供应商全 pass。
- live：openai-compatible 网关 pass（1 个合法 tool call）；Anthropic / Gemini / DeepSeek 直连 / Azure 直连 `untested`。
- 真实 Electron E2E：13 场景通过，运行记录导出与诊断覆盖证据落盘。

## 封装过程

1. 版本从 `3.53.6` 升级为 `3.54.0`。
2. 首次 `npm run build` 在写入 `dist/win-unpacked/神意助手.exe` 时出现 `EBUSY`，随后进程表无残留且文件解锁，判定为打包瞬间被外部工具短暂锁定。
3. 第二次构建在 `rcedit` 更新 EXE 元数据时连续三次 `Fatal error: Unable to commit changes`；该现象在 3.53.6 封装中出现过，清空 `win-unpacked` 后第三次构建完成。
4. 第三次构建成功生成 NSIS 安装包；未配置代码签名证书，签名跳过。

## 产物核验

| 项目 | 证据 |
| --- | --- |
| 安装包 | `dist/神意助手-Setup-3.54.0.exe`，130,391,813 bytes |
| Blockmap | `dist/神意助手-Setup-3.54.0.exe.blockmap`，135,898 bytes |
| EXE 元数据 | FileVersion `3.54.0`，ProductVersion `3.54.0`，ProductName `神意助手` |
| asar 版本 | `@electron/asar` 读取 `app.asar/package.json`：`3.54.0` |
| NSIS 配置 | `oneClick: false`，`allowToChangeInstallationDirectory: true`，`include: build/installer.nsh` |
| SHA256 | `7728C715DEB0F496C103E58FE45CCC293C77A1F514AFBDB5B1331A161FE595FE` |
| 旧产物清理 | 旧 `3.53.6` 安装包与 blockmap 已删除，`dist` 仅保留 3.54.0 一套安装产物 |

## 已验证与未验证

- 已验证：类型检查、692 条服务测试、意图饱和评估、协议仿真、mock E2E、openai-compatible live、生产构建、安装包元数据、asar 版本、NSIS 配置、SHA256、旧产物清理。
- 未验证：本安装包尚未由客户完成人工实操验收；Anthropic / Gemini / DeepSeek 直连 / Azure 直连 live 仍为 `untested`，等待对应供应商配置。

## 客户验证入口

1. 安装 `dist/神意助手-Setup-3.54.0.exe`，确认可选择安装路径。
2. 在主页或大纲工作台发起直写请求，导出运行记录，确认 `protocolVersion`、`protocolVersionDefaulted`、工具轮 scenario 与 usage / `usageUnavailable` 证据完整。
3. 用第三方 folder skill 触发 schema 归一化，确认严格校验错误可读且不破坏既有输入。
4. 重点观察长文档多轮定位：工具轮达到场景上限后应保留已收集结果并进入收敛，不再无限滚轮。
