# 02. 数字牌生成实现设计

## 目标

从同一副 52 张实体牌生成双方各 5 张数字牌，并保存每张数字牌对应的 5 张实体牌证明。该模块决定开局公平性，也是下层阶段和 HandSolver 的输入来源。

## 依赖

- `01-cards-rng-and-deck.md`
- `03-hand-solver.md` 中的可解校验接口

## 建议文件

- `src/domain/cards/number-card-generator.ts`
- `src/domain/cards/number-card-generator.test.ts`

错误码统一在 `errors.md` §2 维护；本文件触发错误时引用其中的码。

## 核心类型

```ts
type NumberCardId = string              // 稳定字符串，例：N-01
type NumberCardOwner = "player" | "ai"
type NumberCardStatus = "available" | "used" | "replaced"

type NumberCard = {
  id: NumberCardId
  owner: NumberCardOwner
  value: number                         // 5 张 proofHand 点数和
  proofHand: Card[]                     // 长度 5，proofHand 内部 ID 不重复
  status: NumberCardStatus
}

type NumberCardDeal = {
  playerCards: NumberCard[]             // 长度 5
  aiCards: NumberCard[]                 // 长度 5
  burnCards: Card[]                     // 长度 2
  allNumberCards: NumberCard[]          // playerCards + aiCards，长度 10
  sourceDeck: Card[]                    // 生成本次 deal 的完整 52 张牌顺序（供调试）
  attempts: number                      // 实际尝试次数（1..maxAttempts）
  seed: string                          // 写入 GameState 供复现
}
```

`proofHand` 必须保存生成该数字牌的 5 张实体牌，便于调试数字牌总和关系。`proofHand` 与上层选牌时的 `selectedCards` 不是一个字段：前者是数字牌生成时的内部证据，后者是玩家在 `upperSelect` 阶段选定的 5 张。

### 数字牌 ID 规则

- 格式：`N-XX`，XX 为两位十进制，从 `01` 到 `10`。
- 在一局内全局唯一，与 `owner` 无关。
- 生成顺序：按 `sourceDeck` 切 10 组的顺序，从第 1 组到第 10 组依次分配 `N-01` 到 `N-10`。
- `sourceDeck` 顺序稳定时，相同 seed 生成的 deal 拥有相同的 ID 分配，保证回归测试可断言。

## 详细 API 契约

### `generateNumberCardDeal(input): NumberCardDealResult`

作用：生成一局开局所需的玩家数字牌、AI 数字牌和 burnCards。

参数：

```ts
type GenerateNumberCardDealInput = {
  rng: Rng
  maxAttempts?: number                  // 默认 200
  balanceThreshold?: number             // V1 固定 30
  isSolvable: (value: number, availableCards: Card[]) => boolean
}
```

返回：

- 成功：`{ ok: true, deal: NumberCardDeal }`。
- 失败：`{ ok: false, code: "number-card-generation-failed", attempts, reason }`。

`deal` 字段：

- `playerCards`: 玩家 5 张数字牌。
- `aiCards`: AI 5 张数字牌。
- `burnCards`: 2 张未进入数字牌生成的实体牌。
- `allNumberCards`: 10 张数字牌。
- `sourceDeck`: 生成本次 deal 的完整 52 张牌顺序，供调试与回归测试。
- `attempts`: 实际尝试次数（1 ≤ attempts ≤ maxAttempts）。
- `seed`: 当前 deal 写入的 seed（由调用方传入或在内部从 rng 派生）。

失败处理：

- 达到 `maxAttempts` 仍无法满足平衡和可解条件时返回失败结果，**不抛异常**。
- 调用方（`initializeNewGame`）收到失败结果后写入 `lastError = { code: "initial-hand-unsolvable" }` 并进入 `gameOver`（详见 `07-game-state-and-round-flow.md`）。

调用方：

- `startNewGame` 初始化流程。
- 固定 seed 回归测试。

### `createNumberCardsFromDeck(cards): { numberCards, burnCards }`

作用：把已经洗好的 52 张实体牌转换为 10 张数字牌和 2 张 burnCards。

参数：

- `cards`: 洗牌后的完整 52 张实体牌。

返回：

- `burnCards`: 前 2 张（`cards[0]`、`cards[1]`）。
- `numberCards`: 剩余 50 张按 5 张一组生成的 10 张数字牌，初始 `owner: "player" | "ai"` 待 `assignNumberCards` 填充，`status: "available"`。

每张数字牌 ID 按生成顺序从 `N-01` 到 `N-10` 分配。`proofHand` = 该组 5 张实体牌按 `sourceDeck` 顺序排列。

失败方式：

- 输入不是 52 张唯一实体牌时返回 `{ ok: false, code: "invalid-source-deck" }`。
- 调用方（`generateNumberCardDeal`）收到失败后重新洗牌重试，与 `number-card-generation-failed` 同等处理。

### `assignNumberCards(numberCards, balanceThreshold): AssignmentResult`

作用：从 10 张数字牌中选出玩家 5 张和 AI 5 张，使双方总和差距最小并满足阈值。

参数：

- `numberCards`: 10 张未分配数字牌。
- `balanceThreshold`: V1 为 30。

返回：

- 成功：`{ ok: true, playerCards, aiCards, difference }`。
- 失败：`{ ok: false, code: "balance-threshold-exceeded", bestDifference }`。

实现规则：

- 枚举全部 252 种分配（`C(10, 5) = 252`）。
- 选 `abs(sum(playerCards) - sum(aiCards))` 最小者。
- **差距相同时的 tiebreaker（V1 固定）**：按玩家 5 张 `numberCard.id` 字典序升序选第一组。即 `playerCards.map(c => c.id).join(",")` 字典序最小的那组胜出。
- 该 tiebreaker 保证固定 seed + 固定 sourceDeck 顺序下分配结果可复现。

### `validateNumberCardDeal(deal): ValidationResult`

作用：验证数字牌 deal 是否满足全部数学不变量。

参数：

- `deal`: 已生成的数字牌分配。

返回：

- `{ ok: true }` 或 `{ ok: false, reason, details }`。

检查项：

- 双方各 5 张。
- burnCards 2 张。
- 总和关系等于 364。
- proofHand 无重复。
- 52 张实体牌完整覆盖。
- 双方差距不超过 30。

### `markNumberCardUsed(cards, cardId): NumberCard[]`

作用：把一张数字牌标记为已使用。

参数：

- `cards`: 某一方数字牌列表。
- `cardId`: 要使用的数字牌 ID。

返回：

- 新数组；匹配数字牌 `status = "used"`。
- `proofHand` / `value` / `owner` 等其他字段不变。

失败方式：

- 找不到 ID 时返回 `{ ok: false, code: "number-card-not-found" }`。
- 数字牌 `status !== "available"`（已 used 或 replaced）时返回 `{ ok: false, code: "number-card-already-used" }`。
- reducer 收到失败时写入 `state.lastError`，**不**抛异常中断流程。

### `replaceUnsolvableNumberCard(input): ReplaceNumberCardResult`

作用：当某一方剩余数字牌全部不可解时，用当前共享牌库生成一张替换数字牌。

参数：

```ts
type ReplaceUnsolvableInput = {
  owner: "player" | "ai"
  cards: NumberCard[]                   // 该方当前数字牌列表
  drawPile: Card[]                      // 当前共享牌库未用牌（不含 burnCards / discardPile）
  rng: Rng
  isSolvable: (value: number, availableCards: Card[]) => boolean
}
```

返回：

- 成功：`{ ok: true, cards, replacement }`。
  - `cards`: 替换后的新数字牌列表。
  - `replacement`: 新数字牌对象，`status = "replaced"`，`proofHand` 来自当前共享牌库，5 张牌按稳定顺序排列（按 `card.id` 字典序升序，见 01 文档附录 B）。
  - 被替换掉的原数字牌 `status = "replaced"`（不是 `used`），并从 `cards` 列表中移除。V1 不再保留旧数字牌对象。

钉死的 V1 规则：

- **选哪张数字牌替换**：从 `cards` 中按列表顺序找到第一张 `status === "available"` 且 `isSolvable(value, drawPile) === false` 的数字牌，替换之。若存在多张不可解，每次只替换一张；剩余不可解牌本回合不参与（玩家或 AI 用尽所有不可解牌时由状态机决定是否继续重算或提前结束，见 `07-game-state-and-round-flow.md`）。
- **选哪 5 张牌作为 proofHand**：调用 `HandSolver.solveHands(targetValue, selectableCards, "lowerAvailability")` 找到所有可解 5 张组合，**取第一组**（按枚举生成顺序，无需 RNG 注入）作为 `proofHand`；新 `value` = 该 5 张 `pointValue` 之和。
  - 不使用 RNG 选择"5 张组合"——保证固定 seed 下补牌结果可复现。
- **再次校验**：新 `value` 代入 `isSolvable` 必须返回 `true`，否则返回 `replacement-still-unsolvable`。

失败方式（对应 `errors.md` §2）：

- `not-enough-cards`：`drawPile.length < 5`。
- `no-legal-replacement-hand`：`drawPile.length ≥ 5` 但 `HandSolver` 返回 0 组合。
- `replacement-still-unsolvable`：替换后的 `value` 仍不满足 `isSolvable`。

失败时由 `07-game-state-and-round-flow.md` 的状态机根据"是否双方都不可解"决定进入提前结算或继续到下一回合。

## 生成流程

1. 使用 `buildStandardDeck()` 构建 52 张实体牌。
2. 使用注入 RNG 洗牌。
3. 抽出前 2 张作为 `burnCards`。
4. 将剩余 50 张按顺序切成 10 组，每组 5 张。
5. 每组求 `pointValue` 总和，生成 1 张数字牌。
6. 遍历 10 张数字牌中所有 5/5 分配组合，选择双方总和差距最小的一组。
7. 若最小差距大于 30，重新洗牌生成。
8. 对每张数字牌执行开局可解校验。
9. 返回双方数字牌、burnCards 和 attempts。

分配组合只有 `C(10, 5) = 252` 种，直接枚举即可，不需要复杂优化。

## 开局可解校验

开局校验只使用未进入弃牌区的共享牌库。调用 HandSolver 时使用 `mode = lowerAvailability`，即只统计未用牌组合，不能把未来弃牌区用过牌算作下层可解依据。

若某张数字牌不可解，本次生成失败并重新洗牌。实现需要设置最大尝试次数，例如 200 次。超过后返回明确错误 `number-card-generation-failed`，由状态机进入初始化失败。

## 运行时补牌重算

当某一方剩余数字牌全部不可解时，状态机调用 `replaceUnsolvableNumberCard`：

- 从 `cards` 列表中按顺序找第一张 `available` 且不可解的数字牌（详见上文钉死规则）。
- 从当前共享牌库枚举合法 5 张未用牌组合（`HandSolver` `lowerAvailability` 模式），**取第一组**作为 `proofHand`。
- 用该组合点数和替换那张不可解数字牌。
- 新数字牌 `status = "replaced"`，旧数字牌 `status = "replaced"` 并从列表移除。
- 再次执行可解校验。

补牌重算失败条件：

- 当前共享牌库不足 5 张（`not-enough-cards`）。
- 当前共享牌库不存在任何 5 张组合（`no-legal-replacement-hand`）。
- 替换后仍不可解（`replacement-still-unsolvable`）。

失败时由状态机进入提前结算。补牌重算与生成期校验都使用 `HandSolver` `lowerAvailability` 口径：只允许 `usage = "unused"` 牌参与，不能把未来弃牌区用过牌算作下层可解依据。

## 不变量

- `playerCards.length === 5`
- `aiCards.length === 5`
- `burnCards.length === 2`
- `sum(playerCards) + sum(aiCards) + sum(burnCards.pointValue) === 364`
- `abs(sum(playerCards) - sum(aiCards)) <= 30`
- 每张数字牌的 `value` 等于 `proofHand` 的点数和。
- 每张 `proofHand` 内部没有重复实体牌。
- 10 张数字牌的 proofHand 加上 2 张 burnCards 覆盖完整 52 张实体牌。

## 测试要求

- 固定 seed 下生成结果稳定。
- 总和关系为 364。
- 双方数字牌总和差距不超过 30。
- 每张数字牌 proofHand 点数和等于牌面 value。
- burnCards 不出现在任何 proofHand 中。
- 最大尝试次数耗尽时返回可诊断错误。
- 补牌重算成功时，新数字牌 proofHand 来自当前共享牌库。
- 共享牌库不足 5 张时补牌重算失败并返回原因。

## 实现注意

- 数字牌不是普通扑克牌，不应复用 `Card` 类型。
- 数字牌 ID 与实体牌 ID 分开，避免灾厄判断误把数字牌当实体牌。
- 不要为了"看起来平均"直接生成整数；数字牌必须来自真实 5 张实体牌。
- `proofHand` 仅用于数字牌总和关系调试和开局可解校验；上层选牌时玩家表面选的 5 张是 `selectedCards`（存于 `currentRound.playerLockedHand.selectedCards`），不直接复用 `proofHand`。摊牌（`showdown`）公开的是 `selectedCards` 5 张，`proofHand` 始终保留在数字牌对象内，不向玩家展示。
- 数字牌 `value` 在任何情况下都等于 `proofHand.map(c => c.pointValue).reduce((a,b) => a+b, 0)`，不接受运行时修改。`replaceUnsolvableNumberCard` 替换时整张数字牌对象重建，`value` 由新 `proofHand` 重算。
