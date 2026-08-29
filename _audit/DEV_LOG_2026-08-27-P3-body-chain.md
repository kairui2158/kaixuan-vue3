# 2026-08-27 P3 正文 chain

- 根因：正文层默认 `compose`，多 Skill 只会合并模板。
- 修改：正文层默认/恢复基准改为 `chain`；chain prompt 组装抽出纯函数并测试。
- 验证：focused 10/10；服务 44/44；type-check 无错误；Vue 构建 179 modules；Electron/CDP 保存、重载恢复和用户配置恢复均有原始输出。
- 边界：没有客户 API 配置，未伪造真实三次调用通过。
- 下一阶段：P4 稳定 `skillId` Agent 绑定。
