# 开发日志：loadProject 禁止自动预建卷（2026-08-31）

## 结论

纯大纲项目重新加载时不再凭空生成占位卷。加载路径现在只信任项目文件中已保存的 `volumes`；`ensureVolumesFromOutline()` 仍保留在大纲锁定、创建项目等用户主动入口。

## 变更

- `src/stores/project.ts:145`：移除 `loadProject()` 中“空卷 + 有大纲就自动补卷并保存”的分支。
- `_audit/神意开发经验总结_v2.md`：写入存储纪律第 15 条，并在根因模式索引补充“加载期自动预建”。

## 验证

1. `npx vite build` 通过。
2. 杀掉旧 Electron 进程后用 `node_modules\electron\dist\electron.exe . --remote-debugging-port=9227` 源文件启动。
3. CDP 真实运行态检查返回：

```json
{"currentProjectId":"default","volumesLength":0,"outlineTextLength":69386,"outlineLocked":false}
```

`outlineTextLength` 为 69386 证明项目确有大纲，`volumesLength` 为 0 证明加载路径未再自动预建占位卷。

## 边界

- 本轮只修复 `loadProject()` 自动预建行为；未重新封装安装包。
- `lockOutline()` 与 `createProject()` 的主动建卷入口保持不变。
