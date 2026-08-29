# 卷纲层 P0 基线复核日志（2026-08-29）

## 任务
卷纲层三问题修复 P0：推送归档提交、行号重校、旧字数模型基线记录。本阶段未修改业务代码。

## 归档提交与网络修复
- 遗留归档提交原 `a726e5f` 推送三次失败（TLS 握手失败 / HTTP 408 x2），SSH 443 通道亦被代理断开。
- 根因：归档时误扫入 276 个 `dist-renderer` 构建产物，推送负载实测 100,309,340 字节；剔除后负载降至约 1.3MB。
- 修复：`git rm -r --cached dist-renderer`（磁盘文件保留），`.gitignore` 新增 `dist-renderer/`，同时修复 `.gitignore` 中上一轮坏脚本写入的字面量 `` `n `` 损坏行（该段规则此前从未生效；`_audit/` 保持可跟踪）。
- 归档提交重写为 `4dba642`（443 文件 -> 198 文件），已推送 `157a3a1..4dba642 master -> master`。

## 行号重校结果（设定层线程改动后）
文件：`src/components/pipeline/PipelinePanel.vue`（注意：路径为 pipeline 子目录）

| 锚点 | 旧行号 | 现行号 |
| --- | --- | --- |
| 每卷字数 label/input | 376-380 | 395-396 |
| 卷数输入（readonly+linked） | 376-380 | 397-399 |
| volumeWords ref | - | 1063 |
| linkedVolumeCount 反推 | 1061-1074 | 1150-1158 |
| syncVolumeCount | - | 1160-1167 |
| watch 强制同步 | 1098 | 1183-1190 |
| saveVolumeConfig 持久化 | 1401 | 1291-1303 |
| lockChapterConfig 章数计算 | 1220-1223 | 1305-1317 |
| 生成卷对象（isBound/boundTo 默认） | - | 2197-2198 附近 |
| 锁卷继承 suggestedWords | 1775 | 1864-1866 |
| prompt 每卷字数注入 | 2154-2166 | 2250/2253/2255 |
| 批量补卷 distanceFromWords | - | 2243 |
| 章节层章数兜底 | 1024-1025 | 1112-1114 |
| 章节层总数兜底 | - | 2338 |
| 配置恢复 volumeWords | - | 2766 |
| 章节层卷选择/空提示 | 536-544 | 555/563 |
| confirmedVolumes | 1038 | 1127 |
| 设定绑定协议参考 project.ts | 587-588,605-606,638-639 | 未漂移 |

## 旧字数模型基线（待推翻）
1. `volumeWords`（默认 100000）为用户输入；`linkedVolumeCount = clamp(ceil(总字数/每卷字数), 1, 20)`。
2. `bookWordCount > 0` 时卷数输入 `readonly`，watch 强制 `volumeCount = linkedVolumeCount`。
3. prompt 注入 `[每卷字数] volumeWords`，要求输出 name/outline/summary/suggestedWords。
4. 锁卷时 `suggestedWords` 缺失则继承 `volumeWords`；章节层章数 = `chapterCount || ceil(suggestedWords||volumeWords / wordsPerChapter)`。
5. 持久化：`pipeline_step_config` 存 `volumeWords`/`chapterWords`；恢复时回填 `volumeWords`。

### 缺陷证明
500 万字 + 默认每卷 10 万字 => `ceil(5,000,000/100,000) = 20`，卷数被强制为 20，用户无法选择 7 卷。旧模型无法表达"总字数固定、卷数自由、AI 分配每卷字数"。

## 旧 JSON 卷对象字段清单
`id`（`vol_时间戳_序号`，大纲解析时生成）、`name`、`outline`、`summary`、`suggestedWords`、`confirmed`、`locked`、`wordsPerChapter`、`chapterCount`、`chapterConfigLocked`；设定项另有 `isBound`/`boundTo`。加载项目时 `volumes` 原样恢复（project.ts:143），`id` 跨重启稳定；无 `id` 的旧数据需 P4 兜底。

## P0 验证
- `git status` 干净；基线 `npx vite build` 通过（1.34s，仅既存动态导入警告）。
- 锚点全部用 rg 实测核对，未依赖旧行号。
