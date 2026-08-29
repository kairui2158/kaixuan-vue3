# 2026-08-27 P4 开发日志：稳定 Skill ID Agent 绑定

## 本轮目标

修复 chain 内 Agent 按数组下标绑定造成的 Skill 顺序错位。

## 实施

1. 新增 `skillAgentBinding.ts`，提供稳定键、查询和旧配置迁移。
2. 五层 Pipeline Skill 芯片改为按 `step + skillId` 绑定和渲染。
3. chain 运行时改为按模板对象的 `t.id` 查找 Skill Agent。
4. 保存配置读取时迁移旧索引键；稳定键优先。
5. 新增 focused 测试覆盖顺序稳定、旧配置迁移、稳定键优先和空槽边界。

## 验证

- focused：4 files / 13 tests passed。
- service：2 files / 44 tests passed。
- type-check：无错误输出。
- build：180 modules transformed，构建完成；保留既有警告。
- Electron/CDP：源码构建页面启动；隔离 storage 读写成功并清理。

## 边界

当前 Electron 会话没有项目，流水线入口未出现，因此未把真实下拉框交互写成通过。客户有项目后应补验“绑定 A → 调整 Skill 顺序 → Agent 仍跟随原 Skill → reload 恢复”。

## 经验沉淀

Skill 相关用户配置必须使用稳定 ID 作为持久化身份；数组序号只能用于显示顺序。模板渲染 key 也要稳定，否则 Vue 可能复用旧的 select DOM。迁移必须在 Skill 数组恢复后执行，并保留稳定键优先规则。
