# 卷纲层 P1 日志：卷数与每卷字数解绑（2026-08-29）

## 任务
推翻旧字数模型：大纲层锁总字数后，卷纲层只负责"选择卷数"，不再用每卷字数反推卷数；每卷字数改由 AI+SKILL 分配（`allocatedWords`）。本阶段仅改配置输入与展示，不改 prompt（P2）。

## 修改文件
`src/components/pipeline/PipelinePanel.vue`（42 行 diff，26 增 30 减，含 .gitignore 修复另计）

| 改动点 | 内容 |
| --- | --- |
| 模板 392-398 | 删除"每卷字数"输入框；卷数输入绑定 `volumeCount`、去掉 `readonly`；新增 `volumeCountHint`（role=alert） |
| 列表 434 / 详情 451 | 字数展示改为 `allocatedWords || suggestedWords || '待分配'` |
| 1065 | 新增 `volumeCountHint = ref("")` |
| 1145-1157 | 删除 `linkedVolumeCount` computed；`syncVolumeCount` 自由输入 1-20，非法恢复旧值并写提示；每次变更调用 `saveVolumeConfig()` |
| 1172-1180 | 删除 `watch([bookWordCount, volumeWords])` 强制反推逻辑 |
| 1283 | `saveVolumeConfig` 持久化新增 `volumeCount` |
| 2224 | 删除 `distanceFromWords`（旧反推残留） |
| 2254/2265 | 生成的卷对象归一化 `allocatedWords = Math.max(0, Math.round(...))` |
| 2752 | 配置恢复新增 `volumeCount` 回填 |

## 验证（全部通过）
1. `npx vite build` 通过（2.47s，仅既存动态导入警告），无 `linkedVolumeCount` 残留引用。
2. 杀 Electron 进程 → `start-electron.bat`（源文件启动器）→ CDP 9227 操作：卷数输入 7 保持 7。
3. CDP 输入 25 → 恢复 7，页面显示"卷数需在 1-20 之间，已恢复为 7"。
4. `wa_pipeline_step_config.json` 落盘核对：`volumeCount: 7`。
5. 杀进程重启 → 重新加载项目 → 进卷纲层 → 卷数恢复 7（截图 `docs/P1-volume-count-restart-verify.png`，CDP 复核一致）。

## 遗留与接口
- `volumeWords` ref 与持久化字段仍保留（兼容旧 JSON 读取），P2 prompt 改造后评估是否降级为兼容字段。
- `allocatedWords` 当前仅归一化保存；真实由 AI 输出填充在 P2。
- 临时脚本在 `_audit/tmp/`，P6 收尾清理。
