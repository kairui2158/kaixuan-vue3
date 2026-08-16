# 全回归快速检查

**全部 7 项通过**

| 通过 | 失败 |
|------|------|
| 7 | 0 |

## 逐项结果

| 步骤 | 结果 | 详情 |
|------|------|------|
| A1 设置弹窗打开 | PASS | true |
| A2 技能标签页激活 | PASS | true |
| A3 技能列表编辑按钮存在 | PASS | count=18 |
| B1 流水线面板打开 | PASS | true |
| B2 五层模式下拉存在 | PASS | [{"step":1,"options":["compose","chain","split-merge","multi-step"]},{"step":2,"options":["compose","chain","split-merge","multi-step"]},{"step":3,"options":["chain","split-merge","multi-step","compose"]},{"step":4,"options":["chain","split-merge","multi-step","compose"]},{"step":5,"options":["compose","chain","split-merge","multi-step"]}] |
| C1 引擎存在 | PASS | methods=chain,splitMerge,multiStep,resolveTemplate,getAutoValidators,_splitText,_parallelMap,_extractFirstSubject |
| C2 模板解析 | PASS | result=测试通过 |
