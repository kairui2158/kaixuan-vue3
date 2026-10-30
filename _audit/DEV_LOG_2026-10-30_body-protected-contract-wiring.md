# DEV LOG：正文层受保护契约与候选账本接线（2026-10-30）

## 背景

`run-trace-正文层-20261030-213657-deep` 中，S2 三次物理请求分别输出 2650 / 3479 / 3677 净汉字，但最终验收仍使用第 1 次 2650 字、缺正文交接的候选。SKILL 方据此提出候选选择、字数口径、提示词冲突、重试反馈与降AI重叠五类问题。本轮只处理应用侧，不修改 folder SKILL。

## 交付

- 正文契约升级为受保护契约：应用在 folder `preProcess` 后注入，SKILL 无法折叠或删除；最终请求缺契约时阻止物理调用。
- 重试候选全部测量并落账：净字数、原始字符、交接区块数、契约距离、缺失交接、有效性与错误数逐次记录，trace 可见。
- 候选保留策略改为契约感知比选：错误数打平时，交接完整且契约距离更小的候选优先，不再默认保留最早候选。
- 字数不足重试反馈改为 `word-gap` 策略：只传目标、下限、当前、缺口与修复要求，不回传候选全文，避免请求体滚动放大。
- `word-gap` 反馈补充应用侧结构骨架：从上一版【正文交接】提取章节、场景、角色状态、章末状态与 FACT_LOCK 等有界字段（默认 800 字符），“保留结构”不再只是口头约束；无交接账本时显式声明骨架缺失，不伪造。
- 终步回显修复改为角色感知：S3 polish 只观察高重合，不触发重试；逐字相同才修复。generator 终步保持 0.85 阈值；角色来源写入 diagnostics，不再硬编码最后一步为 polish。
- compose 与链式入口删除旧 prompt suffix 双语义，统一从 `resolveProtectedBodySkillContract` 进入执行器。
- 新增真实 S2 集成测试，直接加载外部 folder SKILL 的 `kaixuan-s2/script.js`，验证契约注入与真实 postProcess 的适配关系。
- 已补交 SKILL 适配手册：[FOLDER_SKILL_BODY_PROTECTED_CONTRACT_GUIDE_2026-10-30.md](FOLDER_SKILL_BODY_PROTECTED_CONTRACT_GUIDE_2026-10-30.md)。

## 验证

- `npx vitest run` 定向 12 文件：12 passed / 306 tests passed。
- `npm run type-check`：exit 0。
- `git diff --check`：exit 0，仅 CRLF 提示。
- 真实 S2 集成用例通过：重复交接折叠后契约仍在末尾，`countBodyWords` 与 postProcess 均接受输出。

## 边界

- 不修改 `D:/codex/玄武规划SKILL/凯旋-正文层/kaixuan-s2/script.js`，它作为外部 fixture 读取。
- 不回滚工作区中降AI校准相关既有脏文件：`scripts/calibrate-deai-v2-thresholds.mjs`、`scripts/verify-deai-calibration-release-gate.mjs` 与四个校准审计文件。
- 不升级版本、不封装、不提交 git，等待用户明确确认。
- 本轮 S2 集成使用本地真实 SKILL 脚本与 mock AI service，不是 live 供应商请求；live 生成仍需后续实测。
