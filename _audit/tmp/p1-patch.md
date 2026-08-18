### P1 项目管理彻底删除修复（2026-08-19）

| # | 问题 | 根因 | 修复 | 验证 |
|---|---|---|---|---|
| P1-1 | 幽灵项目占位无法删除 | storage:remove 只从主目录删除，旧目录 (写作助手数据) 文件永远不会清理。旧目录残留 wa_project-prj_msbtqnpe_q24wr3.json 和 wa_projects.json | electron/ipc/storage.js 的 storage:remove 增加 legacyDir 清理；src/stores/project.ts 的 deleteProject 增加 wa_project_ 格式删除，删除所有项目时清空所有 legacy 格式键和 wa_projects | CDP 验证通过：创建→删除→0 项目→存储无 ghost 键→重启后无项目 |
| P1-2 | 删除后项目列表显示旧数据 | loadProjectList 没有前置清空 projectList，导致筛选后仍残留旧项 | 在 loadProjectList 开头增加 projectList.value = [] | CDP 验证通过 |
| P1-3 | 删除最后一个项目后 lastProjectId 残留 | 未清理 lastProjectId | 在 loadProjectList 中 projectList.length === 0 时清理 lastProjectId | CDP 验证通过：lastProjectId=NONE |
| P1-4 | 旧格式 wa_project- 键未被清理 | deleteProject 只删除了 storageKey('project_' + id) 和 wa_project- + id | 增加 wa_project_ + id 格式删除，项目全空时扫描所有 key 清理 legacy 格式 | CDP 验证通过：ghost 键数组为空 |

经验总结：文件系统存储的删除操作必须考虑所有历史格式和目录。删除后必须验证存储层和 UI 层都已同步。P1 通过后检查 lastProjectId 是否被清除。
