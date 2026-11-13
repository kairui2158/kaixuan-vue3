# DEV LOG - 2026-11-13 - body layer LHC K69/K70/K72 settlement

- 范围：`D:\codex\玄武规划SKILL\凯旋-正文层\` 与 SKILL 经验账本；不修改应用产品代码。
- 结论：`run-trace-正文层-20261113-104548-deep` 是 K69/K70 修复前旧版的合法回归样本，不是现役 LHC 新版失败。Trace S2/S3 script 指纹分别为 `b8058bdd.../48591B` 和 `34d8a964.../66105B`；现役唯一导入源分别为 `CCB7FEBC.../49172B` 和 `623F762B.../71848B`，template 均为 15:51:44 版；源码树旧指纹命中 0。
- 新架构记录：LHC（Ledger-Handoff Contract）现役合同为 S2/S3 输出 `{"body":"正文全文","metadata":{"extractedMeta":["【正文交接】…账本…"]}}`；S1 保持行合同。`body` 保留文学正文，`extractedMeta` 承载可校验账本；legacy 单形态仅过渡兼容，禁止双写。
- 失败链：该 run 为断点恢复，S1 未执行；S2 success，raw 4791 / 净 2889，word-gap 放行；S3 三次失败分别为同线死锁 2775<2800、2754 加自知报告句误伤、外层围栏嵌套导致旧解析器裸 parse 失败。
- 耗时定谳：逻辑 API 2 次、物理调用 5 次，总物理时长约 1,219,252ms；S3 attempt usage reasoningOutputTokens=10519 / outputTokens=14005，reasoning 约 75%，耗时主导是 deep 模型思考，不是调用风暴。payload 文件编号不是 attempt 时序。
- 修复：S3 地板改为账本“生成下限”优先，fallback 0.8×target；注入打磨预算；S2/S3 解析器支持外层围栏抢救；自知正则收窄为感知型；template 禁围栏并声明事实性知道豁免。
- 验证：104548 主回归 PASS；salvage 回归 PASS；selfreport 回归 PASS；K13 LHC 信封回归 PASS；全量 56 个独立测试 JS `TOTAL=56 / FAILED_COUNT=0`；S2/S3 `node --check` exit 0。
- 台账：`D:\codex\玄武规划SKILL\经验总结与教训记录.md` 已新增 K72（line 5016）并保留 K68-K71 与 LHC 现役架构合同（line 5043）。
- 边界：离线回归 PASS 不等于 live PASS；现役新版仍需真实应用重跑一章定论。已登记暗伤：S3 输入约 32089 字符但缺同级 payload diet 门禁、attempt2 自知残留缺独立 fixture。应用侧遗留：`deai-model-profile calibration-not-ready` 未注入。
