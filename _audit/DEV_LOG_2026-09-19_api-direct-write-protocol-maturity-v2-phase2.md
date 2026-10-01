# DEV LOG: API 直写协议成熟化 V2 Phase 2

日期：2026-09-19

## 本阶段范围

- `skillValidation.ts` 增加 schema 自身校验与归一化层。
- 显式 `undefined` 属性按“字段不存在”处理，必填字段报缺失，不再误报类型错误。
- schema 校验覆盖：深度上限 100、循环引用、顶层必须 object、非法 type/required/properties/items/numeric/enum、`additionalProperties:false` 只能用于 object。
- folder schema 归一化：有 properties 的 object 默认补 `additionalProperties:false`，并记录归一化事件。

## 验证记录

- `npm exec -- vitest run src/services/skillValidation.spec.ts src/services/editorTools.spec.ts src/services/workspaceSkillEngine.spec.ts`
  - 3 个测试文件，56 passed。
- 归一化测试确认：
  - 根 object 补 `additionalProperties:false`。
  - 嵌套 object 补 `additionalProperties:false`。
  - 归一化事件数量为 2。
  - 归一化后 schema 继续拒绝未知字段。

## 影响面

- `validateStructuredValue()` 内部改为先走 `validateAndNormalizeSchema()`。
- 四类消费方复用同一入口：pipeline、workspace skill、editor tool、测试契约。
- 本阶段未改运行 trace 事件结构；schema 归一化事件先保留在服务层返回值中，后续接线时写入 trace。
