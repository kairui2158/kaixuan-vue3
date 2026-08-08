# AI验证AI功能完整实现经验 v2.7.48

**日期**: 2026-08-07
**版本**: v2.7.48
**范围**: P1-P12开发 + V1-V7验证矩阵

## 教训#85: CDP验证必须先打开modal再检查DOM

**现象**: CDP查询 `#deai-verify-provider-status` 返回 NOT_FOUND，但源文件中存在该元素
**根因**: 设置面板未打开，元素在隐藏modal内，DOM存在但不可查询到display状态
**解决**: CDP验证脚本必须先 `btn-settings.click()` 打开modal，再 `modal-tab[data-tab=deai].click()` 切到去AI味tab，然后才能查询元素
**教训**: CDP行为验证必须模拟真实用户操作路径，不能跳过UI状态切换

## 教训#86: PowerShell node -e 转义问题

**现象**: 在 PowerShell 中执行 `node -e` 传递含双引号/中文的 JS 代码时，PowerShell 转义导致语法错误
**解决**: 用 `@'...'@ | Out-File` 创建临时 .js 文件，再用 `node file.js` 执行
**规则**: 含中文/双引号的 Node.js 脚本一律用 Write 工具或 Here-string 写入 .js 文件执行

## 教训#87: HTML块替换用索引定位而非字符串匹配

**现象**: apply_patch 和字符串 replace 对含大量空白/换行的 HTML 块匹配失败
**解决**: 用 `html.indexOf(startMarker)` 和 `html.indexOf(endMarker)` 获取精确索引，再用 `substring` 拼接替换
**规则**: 大块 HTML 替换优先用索引定位，不用字符串匹配

## 教训#88: 流程预览的模式覆盖必须全量

**现象**: `_updateFlowPreview` 只在 chain 模式插入了 `_hasVP` 检查，multi-step 和 split-merge 模式缺失
**根因**: 开发时只考虑了 chain 模式，后续新增模式时遗漏了 `_hasVP` 逻辑
**解决**: 将 `_hasVP` 计算提取到所有模式分支之前（公共区域），3种模式各自插入步骤
**规则**: 新增模式分支时，必须检查所有共享逻辑（如验证供应商、硬规则）是否在新分支中也生效

## P1-P12 实现摘要

| 编号 | 内容 | 文件 | 行号 |
|------|------|------|------|
| P1 | 供应商用途UI去掉detect | renderer.html | L282-283 |
| P2 | 去AI味面板显示验证供应商状态 | renderer.html + renderer_v2.js | L536, L1437 |
| P3 | 3张模式卡片 | renderer.html | L462-521 |
| P4-P6 | 三卡片各自展开内容 | renderer.html | L469-517 |
| P7 | 通用参数提取到卡片上方 | renderer.html | L439 |
| P8 | 验证供应商接入deAiProcess | renderer_v2.js | L585/609/744 |
| P9 | cross_model_check接入3种模式 | renderer_v2.js | L584/608/742 |
| P10 | 验证结果反馈到进度弹窗 | renderer_v2.js | L732-736 |
| P11 | renderDeAiSettings按模式动态渲染 | renderer_v2.js | L1416 |
| P12 | 流程预览按模式显示不同流程 | renderer_v2.js | L1565 |

## V1-V7 验证结果

| 编号 | 验证方法 | 结果 |
|------|----------|------|
| V1 | 代码证据矩阵 | PASS - 每项P列出文件+行号+代码片段 |
| V2 | 连通性验证 | PASS - 供应商→getVerifyProvider→_aiRequest→cross_model_check→日志 |
| V3 | 端到端测试 | SKIP - 需实际API调用，用户实操时验证 |
| V4 | 反验证 | PASS - 无验证供应商时流程预览不显示AI验证AI |
| V5 | CDP行为验证 | PASS - 3卡片切换+模式配置+流程预览+供应商状态 |
| V6 | 最终审计 | PASS - P1-P12+V1-V5逐项对照 |
| V7 | 经验文件更新 | PASS - 本文件 |
