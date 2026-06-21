# 03. HandSolver 实现设计

## 目标

给定目标值和当前可选择实体牌集合，枚举所有点数和等于目标值的 5 张组合。HandSolver 同时服务下层可解校验、上层候选组合展示、AI 估计玩家可能成手集合。

## 依赖

- `01-cards-rng-and-deck.md`

## 建议文件

- `src/domain/hand/hand-solver.ts`
- `src/domain/hand/hand-solver.test.ts`

错误码统一在 `errors.md` §3 维护；本文件触发错误时引用其中的码。

## 核心类型

```ts
type CardUsage = "unused" | "used"
type SolveMode = "lowerAvailability" | "upperSelection"

type SelectableCard = {
  card: Card
  usage: CardUsage
}

type SolvedCard = {
  card: Card
  usage: CardUsage
  effective: boolean                    // true 表示参与牌型 / 灾厄 / 弃牌区更新
}

type SolvedHand = {
  cards: SolvedCard[]                   // 长度恒为 5，按 input 顺序排列
  effectiveCards: Card[]                // cards 中 effective = true 的子集
  totalValue: number                    // 5 张 pointValue 之和（与 effective 无关，见下文）
  usedCardCount: number                 // cards 中 usage = "used" 的数量，0..5
  allCardsUnused: boolean               // usedCardCount === 0
}

type SolveResult = {
  targetValue: number                   // 入参原值
  hands: SolvedHand[]                   // 满足条件的 SolvedHand；空数组表示无解
  count: number                         // 等于 hands.length；若截断也等于真实总数
  truncated: boolean                    // 是否因 limit 截断返回
}
```

`effective` 表示该牌在本回合是否真正参与牌型、灾厄和弃牌区更新。`usage = used` 的牌在上层可选，但 `effective = false`。

### `totalValue` 的口径（重要）

- `totalValue` **总是等于 5 张 `cards.card.pointValue` 之和**，**与 `effective` 无关**。
- 原因：玩家表面选择的是"5 张点数和等于目标值"的组合；用过牌失效是上层阶段的口径，不影响数字牌求和的初衷。
- 例：玩家选了 `A(1) + A(1) + A(1) + A(1) + 5(5)` 共 5 张点数和 9，其中前 4 张是弃牌区用过牌。`totalValue = 9`（5 张原始点数），`effectiveCards.length = 1`（仅 `5`），`usedCardCount = 4`，`allCardsUnused = false`。
- `effectiveCards.map(c => c.pointValue).reduce((a,b) => a+b, 0)` **不等于** `totalValue`，仅在 `allCardsUnused = true` 时相等。

## 详细 API 契约

### `solveHands(input): SolveResult`

作用：枚举目标值下全部合法 5 张表面组合。

参数：

- `targetValue`: 目标点数和。
- `selectableCards`: `SelectableCard[]`。
- `mode`: `lowerAvailability | upperSelection`。
- `limit`: 可选最大返回数量；V1 默认不限制，调试或 UI 可传入上限。

返回：

- `targetValue`: 原目标值。
- `hands`: 满足条件的 `SolvedHand[]`。
- `count`: 未截断时等于 `hands.length`；若传入 limit，`count` 仍表示真实总数。
- `truncated`: 是否因 limit 截断返回。

失败方式：

- `targetValue` 非整数时抛出 `invalid-target-value`。
- `selectableCards` 中出现重复实体牌 ID 时抛出 `duplicate-selectable-card`。

调用方：

- 下层数字牌可解校验。
- 上层候选组合展示。
- LowerAI/UpperAI/BettingAI 估计。
- 运行时补牌重算。

### `isNumberCardSolvable(targetValue, drawPile): boolean`

作用：给下层阶段快速判断数字牌是否可点击。

参数：

- `targetValue`: 数字牌值。
- `drawPile`: 当前未用共享牌库。**不包含 `burnCards` 也不包含 `discardPile`**；调用方负责传剔除后的列表。

返回：

- 存在至少一组 5 张未用牌点数和等于目标值时返回 `true`。
- 否则返回 `false`。

实现要求：

- 内部使用 `solveHands` 的 `lowerAvailability` 口径。
- 早停优化：找到一组即可返回 `true`，不需要枚举完所有组合。
- `drawPile` 长度 < 5 时直接返回 `false`，不抛异常。

### `createSelectableCards(drawPile, discardPile): SelectableCard[]`

作用：把牌库状态转换成 HandSolver 输入。

参数：

- `drawPile`: 当前未用牌。**不包含 `burnCards`**；调用方负责剔除。
- `discardPile`: 已使用牌。

返回：

- `drawPile` 中每张牌标记 `unused`，`discardPile` 中每张牌标记 `used`。
- 拼接顺序：先 `drawPile`（按内部稳定顺序），后 `discardPile`（按内部稳定顺序），与 `getSelectableCards` 保持一致。
- 不包含 `burnCards`。

失败方式：

- `drawPile` 与 `discardPile` 有重复 ID 时抛出 `card-in-both-piles`（错误码见 `errors.md` §3）。
- `drawPile` 内部出现重复 ID 时同样抛出 `card-in-both-piles`（开发错误）。

### `summarizeSolvedHands(hands): SolvedHandSummary`

作用：给 AI 和 UI 提供轻量摘要，避免每处重复统计。

参数：

- `hands`: `SolvedHand[]`。

返回：

```ts
type SolvedHandSummary = {
  totalCount: number                    // hands.length
  allUnusedCount: number                // allCardsUnused === true 的组合数
  containsUsedCount: number             // allCardsUnused === false 的组合数
  minUsedCardCount: number              // hands 中 usedCardCount 最小值
  maxUsedCardCount: number              // hands 中 usedCardCount 最大值
}
```

字段约束：

- `totalCount === allUnusedCount + containsUsedCount`。
- `allUnusedCount = totalCount` 当且仅当 `mode === "lowerAvailability"`；`lowerAvailability` 模式下 `containsUsedCount` 与 `minUsedCardCount / maxUsedCardCount` 全部为 0。
- `minUsedCardCount / maxUsedCardCount` 仅在 `mode === "upperSelection"` 且 `totalCount > 0` 时有意义；`totalCount === 0` 时全部为 0。
- `hands` 为空数组时所有字段为 0。

注意：

- 不包含牌型强弱统计；牌型统计属于 `HandEvaluator.rankSolvedHands` 之后的摘要。

## 输入规则

下层可解校验：

- `SolveMode = lowerAvailability`
- 只允许 `usage = unused` 的牌参与枚举。
- 返回 count 用于启用或禁用数字牌。

上层预览：

- `SolveMode = upperSelection`
- 允许 `unused` 和 `used` 牌都参与 5 张组合枚举。
- 组合中 `used` 牌标记为失效，不进入 `effectiveCards`。
- 组合的 `totalValue` 仍按 5 张牌原始点数和计算，因为玩家表面选择的是目标值组合。

AI 玩家可能成手估计：

- 使用 `upperSelection`。
- 输出需要保留 `allCardsUnused` 和 `usedCardCount`，AI 用它估计玩家真选和虚晃概率。

## 枚举算法

V1 使用直接 5 重组合枚举。最多 52 张，组合数约 260 万，纯前端可接受。

**V1 实现选择（钉死）**：迭代式组合生成器（5 层 `for` / while 嵌套或递归转迭代），不使用 yield 或 generator。理由：性能略好、stack 友好、便于早停。

必须保证：

- 不生成重复组合。
- 不修改输入数组。
- 每组固定按输入顺序（`selectableCards` 数组顺序）排列。
- 只保留 `pointValue` 总和等于目标值的组合。
- `lowerAvailability` 模式下遇到 `usage === "used"` 的牌直接跳过，不进入组合。
- `upperSelection` 模式下 `usage` 任意，但生成组合时 `effective = (usage === "unused")`。

后续性能不足时再加缓存或 Web Worker。V1 不提前引入缓存，避免状态同步复杂化。

## 输出排序

HandSolver 自身只负责枚举，不做牌型排序。排序由 HandEvaluator 或 UI 层完成。HandSolver 的 `hands` 数组输出顺序（V1 固定）：

1. 按枚举生成顺序（深度优先，最左索引先增）。
2. 排序 key：每组 `cards.map(c => c.id).join(",")` 字典序升序。
3. 等价表述：先按 `cards[0].id` 升序；同 key 时按 `cards[1].id` 升序；依此类推。

这一稳定顺序让 `assignNumberCards`、`chooseLowerNumberCard`、`chooseUpperHand` 等依赖 `hands[0]` 取首组结果的地方有可复现的行为。

不要在 HandSolver 内部调用 HandEvaluator，避免循环依赖。

## 不变量

- 每个 `SolvedHand.cards.length === 5`。
- 每个组合 5 张实体牌 ID 不重复。
- 每个组合 `totalValue === targetValue`（按 5 张原始 pointValue 之和）。
- `effectiveCards` 只包含 `usage = "unused"` 的牌。
- `usedCardCount + effectiveCards.length === 5`。
- `lowerAvailability` 不返回含用过牌的组合（`allCardsUnused === true`）。
- `upperSelection` 可以返回含用过牌的组合，并正确标记 `effective = false`。
- `hands` 数组按稳定顺序（按 `cards.map(c => c.id).join(",")` 字典序升序）排列，跨调用稳定。
- 不存在合法组合时 `hands = []`、`count = 0`、`truncated = false`，**不是错误**。
- 输入不足 5 张时同上。

## 测试要求

- 目标值可解时返回至少一组合法组合。
- 每组 `totalValue` 都等于目标值（与 `effective` 无关）。
- 输入包含弃牌区用过牌时，`lowerAvailability` 不使用它们。
- 输入包含弃牌区用过牌时，`upperSelection` 可以使用它们并标记 `effective = false`。
- 不存在合法组合时返回 `count = 0` 且 `hands = []`。
- 输入不足 5 张时返回 `count = 0` 且 `hands = []`。
- 同一输入多次调用输出稳定（`hands` 数组 byte-equal）。
- 5 张全为用过牌时：`usedCardCount = 5`，`effectiveCards.length = 0`，`allCardsUnused = false`，`totalValue` 仍等于 5 张之和。
- 跨 burnCards 不参与枚举：`createSelectableCards` 输入的 `drawPile` 已是剔除 burnCards 的列表；测试 fixture 显式断言 burnCards 不出现在 `selectableCards` 里。

## 实现注意

- 不要把“用过牌可选但失效”放到 UI 层临时处理；这是规则口径，必须在 domain 层有结构化输出。
- 不要把 HandSolver 和 HandEvaluator 合并。枚举和评价是两个独立职责。
