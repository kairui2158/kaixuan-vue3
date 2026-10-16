# DEV LOG: 创作风格档案结构化 V2 收口（3.92.0）

## 交付状态

创作风格档案从“标签 + 参数”升级为结构化 V2：`profileVersion:2`、拆书档案导入、单源编译器、六层有预算注入、结构化 trace、锁定态保护与双宿主同步。旧 V1 档案继续按原语义加载，不静默升级、不静默注入。

## 用户可见行为

1. 用户可导入真实拆书档案（本轮样本：`D:/codex/拆文库/踏星/.novel/benchmarks/踏星/文风.md`），导入前可预览，应用后成为未锁定草稿。
2. V2 档案包含 8 条句式模式、4 条场景模板、4 条警戒线、5 条日更规则，并可逐条启停；锁定后导入、AI 分析、规则启停均禁用，页签仍可查看。
3. AI 分析只允许填充定位、标签、节奏、正向规则；声口、句式、场景、日更、警戒线属于证据绑定字段，证据不足时明确声明，不允许从大纲伪造。
4. 大纲、设定、卷纲、章节、正文、终稿按各自预算消费结构化风格块；未锁定零注入；本地变换与抽取任务保持豁免。
5. 大纲工作台与流水线双宿主同源同步；大纲锁定后，风格作为独立证据参与生成链路，不随编辑动作漂移。

## 架构与注入账

- 数据模型：`project.ts` 支持 `profileVersion`、`source:'benchmark-import'` 与 V2 结构化数组，V1 normalize 兼容。
- 导入：`styleBenchmarkImport.ts` 严格解析标准拆书结构，失败返回结构化错误，不猜字段。
- AI 分析：`styleAnalysis.ts` 区分可推断字段与证据绑定字段，越权返回字段被忽略。
- 编译：`styleContextCompiler.ts` 单源输出注入文本、`injectedChars`、`truncated`、`truncationReason`、`sections`。
- trace：`style-profile` 事件记录版本、目标层、注入量、裁剪与 sections；请求级证据落盘 `provider-requests.json`。
- P0 预算账：`STYLE_PROFILE_P0_BUDGET_ACCOUNT.json`。六层各 3 条样本，实测注入为 outline 232/600、settings 304/500、volume 219/600、chapter 379/800、body 767/1200、final-draft 767/1200，均未裁剪；估算 token 增量不改变窗口路由判定。

## 收尾修正

- `scripts/style-profile-p0-budget-account.entry.mjs` 删除重复 import，避免同一账本重复执行。
- `styleContextCompiler.ts` 修正 `truncated` 口径：仅真实发生裁剪时为 `true`，渲染长度恰好等于预算不再误报。
- Electron 验证器补齐失败证据落盘；历史失败现场归档在 `verification-style-profile-electron-archive/`，当前 `report.json` 为通过版本。
- 本轮“失败时证据未落盘”问题由既有 G1.5 覆盖：验证器断言、采集器、证据载体必须同批升级。经裁决不新增门禁，本条为执行记录。

## 验证

| 项 | 结果 |
|---|---|
| 定向测试 | 4 files / 14 tests passed |
| 全量服务测试 | 169 files / 1959 tests passed |
| 类型检查 | `npm run type-check`：exit 0 |
| 构建 | `npm run build`：通过；既有 jieba externalized、chunk 大小、`__dirname` warning，无新增 |
| Electron 可见 UI | V2 导入、预览、应用、启停、锁定、AI 分析边界、双宿主路由、请求级 prompt 全过 |
| 打包启动核验 | `node scripts/verify-packaging-3-92-0.mjs`：`PACKAGING 3.92.0 VERIFICATION PASSED` |

## 诚实边界

- 生成质量提升未验证：本轮只证明结构化风格正确、有界、可审计地注入请求，不做写作质量收益声明。
- Electron 使用本地 OpenAI-compatible mock provider，非外部 live 供应商。
- 更极端的拆书格式变体需用真实客户档案持续采样；本轮覆盖标准结构与基础负路径。

## 封装

- 版本：3.92.0
- 安装包：`dist/神意助手-Setup-3.92.0.exe`，231,539,306 bytes，SHA256 `aa25935ec9313b9387fd4c350760764ca97af46247976098fb91fe0b02250a2f`
- 打包证据：`_audit/verification-packaging-3-92-0/packaging-evidence.json`
- 旧产物：3.91.1 安装包与 blockmap 已清理，仅保留 3.92.0
