# 发布收尾清单

适用范围：每次准备交付安装包、升级版本号或对外发布前的收尾检查。逐项核对，不允许只写“已完成”。

## 1. 版本与产物

1. `package.json` 与 `package-lock.json` 版本一致。
2. 安装包文件名中的版本号与 package 版本一致。
3. 最新安装包只保留当前版本，旧安装包按当轮决策清理。
4. `npm run build` 或对应构建命令新鲜通过。

## 2. folder SKILL 降AI手册版本同步

1. 核对 [_audit/FOLDER_SKILL_DEAI_CONTRACT_GUIDE_2026-10-29.md](FOLDER_SKILL_DEAI_CONTRACT_GUIDE_2026-10-29.md) 的手册版本与 `src/services/skillDeaiContract.ts` 的 `SKILL_DEAI_CONTRACT_VERSION` 一致。
2. 以下任一变更时，手册必须同批更新并登记变更原因：
   - 检测内核或阈值；
   - 降AI提示词内容；
   - 契约字段、合法值、默认值；
   - trace 事件名或语义；
   - folder/agent 双路径接线方式。
3. 发布前运行：

```powershell
npx vitest run src/components/pipeline/__tests__/deai-injection-policy.spec.ts
```

该测试同时锁定契约实现、字段合法值、默认值、事件白名单和手册内容。测试失败时不得发布。

## 3. 验证与日志

1. 定向测试覆盖本轮改动面；全量 Vitest 新鲜通过。
2. 涉及 UI 的改动必须有真实 Electron/Playwright 验证，不允许只以单测或静态扫描替代。
3. 当轮 DEV_LOG、任务台账、`DEV_LOG_MASTER_INDEX.md`、经验文件更新一致。
4. 台账七节完整，缺口清单如实登记；没有登记为“无登记缺口”时不得声称闭环。

## 4. 诚实边界

1. 检测/评分/阈值/verdict 仍为 `provisional` 时，发布说明不得宣称“最终校准完成”。
2. 未做 live 供应商验证时，必须写明验证载体是本地 mock 还是真实供应商。
3. 工作区未提交改动需按当轮决策登记；不得把未提交状态伪装成已交付。
