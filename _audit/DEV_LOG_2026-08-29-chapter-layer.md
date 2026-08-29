# 章节层经验复现开发日志

## 任务
按 `_audit/章节层经验复现执行计划.md` 执行章节层 UI 重构，从 P0 到 P9，版本从 3.5.1 升至 3.6.0。

## 改动范围
- 唯一修改的业务文件：`src/components/pipeline/PipelinePanel.vue`（+310 -102 行）
- 版本号：`package.json` 从 `3.5.1` 升至 `3.6.0`

## 各阶段结果

| 阶段 | 内容 | 结果 |
|------|------|------|
| P0 | 基线盘点 | PASS |
| P1 | 顶部控制区收敛为单行网格 | PASS |
| P2 | 章节列表改为深色平铺表格 | PASS |
| P3 | 章节详情弹窗 | PASS |
| P4 | 生成反馈居中弹窗 | PASS |
| P5 | 数据链路回归 | 20/20 PASS |
| P6 | 配色/字号/溢出审计 + 死 CSS 清理 | 11/11 PASS |
| P7 | 全量构建 + Electron 回归 | 13/13 PASS |
| P8 | 兼容回归 | 20/20 PASS |
| P9 | 版本升级、封装、记录、清理 | PASS |

## P6 清理的死 CSS
- `.pl-ch-list` / `.pl-ch-card` / `.pl-ch-plot` / `.pl-ch-generation-feedback` / `.pl-ch-generation-header` / `.pl-generation-feedback`

## P8 修复的验证脚本问题
1. `offsetParent` 对 `v-show` 的 `display:none` 元素返回 null 导致误报；改用 `getComputedStyle().display !== 'none'`
2. 步骤断点用 `#pl-status-N` ID 点击但模板实际用 `.pl-step` class（无 ID）；改为 `querySelectorAll('.pl-step')[idx].click()`
3. `#pl-body-result` 使用 `v-if` 条件渲染，无内容时无 DOM 节点；改为检查 `v-if` 机制

## 安装包
- 产物：`dist/神意助手-Setup-3.6.0.exe`
- 大小：约 94.3 MB（94,295,947 字节）
- 时间：2026-08-29 22:10:25

## 结论
章节层 P0-P9 闭环完成。UI 从卡片+列表结构改为深色平铺表格，生成反馈从页面固定区改为居中弹窗，详情编辑从内联改为弹窗。全部业务语义、数据链路、生成逻辑、锁定规则未变。
