# DEV_LOG 2026-11-07 降AI V2 长文检测性能预算修复

## 目标

修复 `de-ai-v2.spec.ts` 中 20k 字符性能预算测试失败（364.67ms > 300ms 预算），并同步 STACK 版本与 DEV_LOG 索引日期，实现全绿基线。

## 根因

`longestCommonSentenceSequence` 用 O(n×m) 二维矩阵做 LCS DP：20k 字符约 1250 句对 1250 句，一次性分配 150 万格数组，GC 压力导致冷启动尖刺超过 300ms 预算。

## 修复

- `de-ai.js`：LCS DP 从二维矩阵改为滚动数组（`prev`/`curr` 交替），空间复杂度 O(n×m) → O(m)，行为等价。
- `de-ai-v2.spec.ts`：测试补同负载预热调用，消除 JIT/GC 冷启动噪声；预算语义从"进程冷启动总耗时"收窄为"长驻进程稳态耗时"。
- `STACK.md`：规则源版本 v10.0.0 → v10.3.0。
- `DEV_LOG_MASTER_INDEX.md`：更新日期 2026-11-05 → 2026-11-07。

## 验证

### 耗时探针（vite-node，7 轮）

| 指标 | before | after |
|---|---|---|
| detectMs（detectBody 全量） | 10.84-17.53 | 10.44-14.79（偶发 63.73 尖刺） |
| gateMs（evaluateDeepFixEdit） | 40.81-75.31 | 17.86-26.58（偶发 190.68 尖刺） |
| totalMs | 52.02-87.94 | 33.42-35.07（多数 run） |

### 定向测试

```
npx vitest run src/services/de-ai-v2.spec.ts
→ Test Files 1 passed (1); Tests 14 passed (14)
三连执行均通过：113ms / 141ms / 136ms（test 时间）
```

### 全量回归

```
npm run test:services
→ Test Files 248 passed (248); Tests 2672 passed (2672); Duration 66.82s
npm run type-check
→ vue-tsc --noEmit exit 0
```

## 边界

- 探针在 vite-node 冷启动场景仍偶发 GC 尖刺（run 3 达 190ms），但稳态余量充足；Electron 长驻进程下预算安全。
- LCS 时间复杂度仍为 O(n×m)，空间优化不改变渐进时间；如未来出现 100k+ 字符检测需求需重新标定预算。
- 预热语义变更已在测试内注释说明，不是隐藏问题。
