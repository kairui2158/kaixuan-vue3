# P2 记忆导入与恢复边界续验

日期：2026-08-26

## 本轮目标

按目标队列续验记忆面板的真实入口、导入模式分离和项目恢复边界，不注入假项目、不触发客户文件写入。

## 真实验证

- 启动载体：`start-electron.bat`。
- 进程：`D:\codex\novel-workshop-vue3\node_modules\electron\dist\electron.exe`。
- CDP：`http://127.0.0.1:9227/json/list` 返回页面标题“神意助手”，URL 为 `file:///D:/codex/novel-workshop-vue3/dist-renderer/index.html`。
- 使用真实侧栏入口 `#btn-memory`，打开 `#memory-panel` 后展开 `.mem-more-btn`。
- 菜单 DOM 实测可见：`#btn-export-memory=true`、`#btn-import-memory=true`、`#btn-import-memory-overwrite=true`；菜单文本包含导出、合并导入、覆盖导入、导入角色卡。
- 探针第一次使用全局文本选择误命中禁用的“提取记忆”按钮，第二次使用侧栏选择器时被已打开面板的遮罩拦截；按经验规则没有 force 绕过，重启后按真实操作顺序复验成功。

## 未核销边界

- 本轮没有触发 Windows 原生打开文件窗口，因此不能把入口可见扩大为原生文件选择器通过。
- 复核时发现数据目录存在 3 个 `wa_project_*.json` 历史文件（含 `wa_project_default.json`、一个约 28 KB 项目快照和一个约 1.4 KB 项目快照）。这些文件没有客户验收身份、导入前后配对快照或本轮可逆测试上下文，因此不能冒充“真实项目 JSON 差异核对”证据；项目 JSON 差异、原生文件选择器和关闭/重启恢复继续标记 `UNVERIFIED`，没有制造或修改测试项目。

## 工程门

- `npm run test:services`：2 files passed，42 tests passed。
- `npm run build:vue`：成功，176 modules transformed；保留 Vite native config、无效动态 import 和 chunk size 警告。
- `npm run type-check`：exit 0。
- 临时探针已删除并复核；本轮 Electron 已关闭。

## 结论

P2 的服务层合并、入口渲染和 IPC 桥接已有证据；原生选择器、真实项目落盘差异和关闭重启恢复仍未核销，不能标记为完整客户路径通过。
