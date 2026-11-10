# Agent 提示词三方对账报告（2026-11-11）

- 口径：长度为 UTF-16 字符数（与 JS `.length` 一致）；hash 为项目 `fnv1a32Hash` 的 8 位 hex。
- Store：`D:\神意助手数据\wa_agents.json`；SKILL 配置 JSON：`D:\codex\玄武规划SKILL\agents\玄武凯旋-Agent配置.json`；.agent.md：SKILL 仓库非备份/非调研文件（导入目录镜像按重复计）。
- `N/A` 表示该来源不存在对应记录；只有三方都有值的行才判定一致性。

| ID | Name | Store len/hash | SKILL JSON len/hash | .agent.md len/hash | 一致性 | 选用文件 mtime |
|---|---|---|---|---|---|---|
| agent_玄武_L1_编辑指令 | 玄武-L1大纲编辑指令师Agent | 216/1fb29c69 | N/A | N/A | N/A |  |
| agent_玄武_L1_构思共创 | 玄武-L1构思共创师Agent | 341/16a995ee | N/A | N/A | N/A |  |
| agent_玄武_L1_诊断 | 玄武-L1大纲诊断师Agent | 272/ab24dd59 | N/A | N/A | N/A |  |
| agent_玄武_L1_主编 | 玄武-L1主编落地Agent | 429/cd6e219c | N/A | N/A | N/A |  |
| agent_玄武_L1_B_主编 | 玄武-L1-B大纲共创主编Agent | 601/686e3b3d | N/A | N/A | N/A |  |
| agent_kai_xuan_s1_scene | 凯旋-S1骨架师Agent | 1613/1f558d32 | 1643/356c4829 | N/A | 双方分歧(.md缺失) |  |
| agent_kai_xuan_s2_prose | 凯旋-S2血肉师Agent | 570/061f8e1f | 794/4ae7f6d0 | N/A | 双方分歧(.md缺失) |  |
| agent_kai_xuan_s3_polish | 凯旋-S3打磨师Agent | 758/29da86b8 | 757/93387162 | N/A | 双方分歧(.md缺失) |  |
| agent_xuanwu_l1_build | 玄武大纲构建师 | N/A | 132/b57ab0ce | N/A | N/A |  |
| agent_xuanwu_l1_parse | 玄武大纲解析师 | N/A | 125/f0cded1f | N/A | N/A |  |
| agent_xuanwu_l3_fill | S3-卷纲填充Agent | 181/6267bd34 | 113/819b2d6d | N/A | 双方分歧(.md缺失) |  |
| agent_xuanwu_l3_finalize | 玄武卷纲定稿师 | N/A | 124/19d347a2 | N/A | N/A |  |
| agent_xuanwu_l3_infer | S2-卷纲推演Agent | 307/0d4a6c24 | 118/6989d5e8 | N/A | 双方分歧(.md缺失) |  |
| agent_xuanwu_l3_parse | S1-卷纲解析Agent | 191/cf8ca81e | 117/463d12aa | N/A | 双方分歧(.md缺失) |  |
| agent_xuanwu_l3_validate | S4-定稿师Agent | 678/e7d96bb3 | N/A | N/A | N/A |  |
| agent_xuanwu_l4_fill | S3-章节填充Agent | 183/818e26cc | 136/911a2f06 | N/A | 双方分歧(.md缺失) |  |
| agent_xuanwu_l4_finalize | 玄武章节定稿师 | N/A | 125/a9ea09e2 | N/A | N/A |  |
| agent_xuanwu_l4_infer | S2-章节推演Agent | 230/8762547f | 116/c76695e6 | N/A | 双方分歧(.md缺失) |  |
| agent_xuanwu_l4_parse | S1-章节解析Agent | 165/8720f83a | 123/ebaa5dce | N/A | 双方分歧(.md缺失) |  |
| agent_xuanwu_l4_validate | S4-章节校验Agent | 202/8d340591 | N/A | N/A | N/A |  |

## 结论：0 行三方可比，其中分歧 0 行

- 导入包内嵌旧/不同提示词：成立（见分歧行）；三方数据是独立事实源，不建自动检测器，修复路径为重新导出 SKILL 配置 JSON 或用 UI 对账覆盖。

## 人工抽查 3 条分歧

- `agent_kai_xuan_s1_scene`：store.updatedAt=2026-11-06T17:22:01，pkg.updatedAt 缺失；store 新增“动作场”句号密度条款与更细阈值，pkg 仍含旧 47.4544/52/18 数值。判定 store 更新，pkg 内嵌旧提示词。
- `agent_kai_xuan_s2_prose`：store.updatedAt=2026-11-06T17:22:08，pkg.updatedAt 缺失；store 施工线为净正文 95%，pkg 仍为 90%。判定 store 更新，pkg 内嵌旧提示词。
- `agent_xuanwu_l3_fill`：store.updatedAt=2026-11-10T13:06:58，pkg.updatedAt 缺失；store 已改为“单卷施工稿/舞台状态/卷间承接”表述，pkg 仍为“卷纲”旧职责。判定 store 更新，pkg 内嵌旧提示词。
