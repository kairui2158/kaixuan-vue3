# 直接退出保存 E2E 验证

验证时间: 2026-08-15T21:11:43.551Z
数据目录: C:\Users\凯瑞\Documents\神意助手数据
临时项目: proj-1786828143728
标记文本: DIRECT_EXIT_E2E_MARKER_1786828141505

| 校验项 | 结果 | 说明 |
|--------|------|------|
| project json written after exit | PASS | C:\Users\凯瑞\Documents\神意助手数据\wa_project_proj-1786828143728.json |
| project json parseable | PASS | |
| direct-exit body persisted to disk | PASS | chapter=ch_1786828143736_0_1 |
| outline persisted to disk | PASS | |

## CDP/进程操作记录
| 顺序 | 操作 | 结果 |
|------|------|------|
| 1 | storageRead(wa_lastProjectId) | PASS，原始值 prj_msbtqnpe_q24wr3 |
| 2 | storageRemove(wa_lastProjectId) 后 reload | PASS |
| 3 | 打开大纲工作台并输入大纲标记文本 | PASS，52 字符 |
| 4 | 点击锁定大纲按钮 | PASS，流水线自动打开 |
| 5 | 打开第一章并设置编辑器正文（不保存） | PASS，55 字符 |
| 6 | 向应用窗口发送 WM_CLOSE | PASS，hwnd=2492096 |
| 7 | 退出确认弹窗 #btn-exit-direct 可见并点击 | PASS |
| 8 | 验证磁盘 wa_project_proj-1786828143728.json 已写入 | PASS |
| 9 | 验证 chapter body 与 outlineText 落盘 | PASS |
| 10 | 恢复 wa_lastProjectId 并删除临时项目 | PASS |
| 11 | 确认 Electron 进程无残留 | PASS |

## 实际落盘数据（关键字段）
- projectId: proj-1786828143728
- chapterId: ch_1786828143736_0_1
- marker: DIRECT_EXIT_E2E_MARKER_1786828141505
- 数据文件: wa_project_proj-1786828143728.json
- 恢复后 lastProjectId: prj_msbtqnpe_q24wr3

## 结论
直接点击“关闭窗口”，再在退出弹窗点击“直接退出”，应用会先把当前大纲和编辑器正文写入：
C:\Users\凯瑞\Documents\神意助手数据

卸载安装包在 build/installer.nsh 中明确保留该目录，卸载不会删除用户数据。
