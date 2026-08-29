# 设定层 P8：功能行为闭环回归

## 验证

- 源文件 Electron/CDP 真实操作：进入设定层，选择设定项，修改名称，保存，绑定，解除绑定，删除回归项，切换分类。
- `P8_SETTINGS_REGRESSION`：编辑后 `persistedInStore=true`；绑定后 `isBound=true`、`boundTo=["pipeline"]`；解除绑定后 `isBound=false`、`boundTo=[]`；删除后测试项不存在且自动选择相邻项。
- 删除并恢复测试对象后，`collectionRestored.sameNames=true`，说明回归操作没有改变原始名称集合。
- 杀 Electron 后使用 `start-electron.bat` 重启：当前项目 `proj-1787573402261`，角色设定数 `13`，方岫岩存在，恢复标记仍在项目状态中。

## 备注

- 首轮脚本误用旧选择器、错误步骤索引和错误按钮状态分支，均在修改业务代码前通过真实 DOM 定位并修正。
- 客户项目当前角色集合基线为 13 项；不能依据旧日志凭空恢复缺失的陈暮对象。该数据边界已单独记录，不作为本次 UI 修复的业务改动。

## 结论

- P8：PASS。设定项编辑、绑定、删除、分类切换、项目 JSON 持久化和重启恢复均有运行证据。
