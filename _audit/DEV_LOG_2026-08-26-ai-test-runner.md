# AIService 测试载体治理（2026-08-26）

## 本轮范围

只处理 AIService 服务层自动化测试不能被 Node 原生 runner 执行的问题，不修改生产 AI 调用逻辑。

## 根因

`src/services/aiService.spec.ts` 使用 Vite 约定的无扩展名 TypeScript ESM 导入；Node 原生 `node --experimental-strip-types --test` 无法解析 `./providerAdapter`。改用 Vitest 时，原测试文件仍从 `node:test` 注册 suite，Vitest 虽执行了断言但报告为 0 个测试套件。

## 修改

- `package.json` 增加 `vitest` 开发依赖。
- 增加 `npm run test:services`，固定执行 `vitest run src/services/aiService.spec.ts`。
- 将服务层测试从 `node:test`/`node:assert` 改为 Vitest 的 `describe`、`it`、`expect`。
- 未修改 `aiService.ts`、`providerAdapter.ts`、`providerRouter.ts` 生产代码和生产导入规则。

## 验证

命令：`npm run test:services`

结果：`Test Files 1 passed (1)`、`Tests 35 passed (35)`、exit `0`。

Vite 仍报告 `configLoader: native` 警告；该警告属于后续构建警告治理，不与本测试载体混同。

## 经验

测试 runner 必须匹配项目的模块解析约定；Node 原生 runner 失败时不能为了测试而改生产 import。测试文件使用哪套 runner 的断言 API，必须与执行器一致，否则会出现“断言输出成功但套件失败”的假绿/假红状态。
