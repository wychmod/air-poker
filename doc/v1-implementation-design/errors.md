# 错误码总表

日期：2026-06-21  
适用范围：`doc/v1-implementation-design/` 全部文档。  
本目录各文档的失败原因字符串统一在此维护，新增错误码必须同步加进本文档。

错误码一律使用 kebab-case 字符串，作为 `Result<T, { code, message }>` 类型的 `code` 字段。  
测试断言时按错误码匹配，不匹配 message 文本。

## 1. Cards / RNG（01 文档）

| 错误码 | 触发条件 | 抛出位置 |
| --- | --- | --- |
| `invalid-card-suit` | 传入非 `spades/hearts/diamonds/clubs` | `createCard` / `createCardId` |
| `invalid-card-rank` | 传入非 `A/2-10/J/Q/K` | `createCard` / `getPointValue` / `getPokerValue` / `createCardId` |
| `invalid-rng-value` | `rng()` 返回 NaN / Infinity / 负数 / ≥1 | `shuffleDeck` |
| `invalid-draw-count` | `count` 非整数、为负或超过 `cards.length` | `drawCards` |
| `unknown-card-id` | `effectiveCards` 中存在不在 `drawPile` 也不在 `discardPile` 的 ID | `moveEffectiveCardsToDiscard` |
| `empty-seed` | `createSeededRng` 收到空字符串 seed | `createSeededRng`（app 层） |

## 2. Number Card（02 文档）

| 错误码 | 触发条件 | 抛出位置 |
| --- | --- | --- |
| `invalid-source-deck` | 输入不是 52 张唯一实体牌 | `createNumberCardsFromDeck` |
| `balance-threshold-exceeded` | 252 种分配最小差距仍 > 30 | `assignNumberCards` |
| `number-card-generation-failed` | 达到 `maxAttempts` 仍无法满足可解+平衡 | `generateNumberCardDeal` |
| `number-card-not-found` | `numberCardId` 不在指定方列表 | `markNumberCardUsed` |
| `number-card-already-used` | `status !== "available"` 的牌再标记 used | `markNumberCardUsed` |
| `not-enough-cards` | 共享牌库不足 5 张 | `replaceUnsolvableNumberCard` |
| `no-legal-replacement-hand` | 共享牌库无任何 5 张可解组合 | `replaceUnsolvableNumberCard` |
| `replacement-still-unsolvable` | 替换后仍不可解 | `replaceUnsolvableNumberCard` |
| `initial-hand-unsolvable` | 开局数字牌中存在不可解的牌（达到重试上限仍失败） | `initializeNewGame` 包装 |

## 3. HandSolver（03 文档）

| 错误码 | 触发条件 | 抛出位置 |
| --- | --- | --- |
| `invalid-target-value` | `targetValue` 非整数 | `solveHands` |
| `duplicate-selectable-card` | `selectableCards` 出现重复实体牌 ID | `solveHands` |
| `card-in-both-piles` | `drawPile` 与 `discardPile` 有重复 ID | `createSelectableCards` |

> 枚举结果为空（0 组合）不是错误，返回 `{ count: 0, hands: [] }`。

## 4. HandEvaluator（04 文档）

| 错误码 | 触发条件 | 抛出位置 |
| --- | --- | --- |
| `too-many-effective-cards` | `effectiveCards.length > 5` | `evaluateHand` |
| `duplicate-card-in-hand` | `effectiveCards` 内部出现重复 ID | `evaluateHand` |

## 5. BettingEngine（05 文档）

| 错误码 | 触发条件 | 抛出位置 |
| --- | --- | --- |
| `invalid-available-air` | Air 为负数或非整数 | `createInitialBetState` |
| `not-current-actor` | 提交动作的一方不是当前行动方 | `getLegalBetActions` / `validateBetAction` / `getTimeoutBetAction` |
| `betting-closed` | 状态为 `closed` 时仍尝试提交 | `getLegalBetActions` / `validateBetAction` |
| `action-not-legal` | 动作类型不在当前合法列表 | `validateBetAction` |
| `invalid-amount` | 金额非整数或与动作类型不匹配 | `validateBetAction` |
| `raise-exceeds-limit` | raise 增量 > `maxRaise` | `validateBetAction` |
| `bet-exceeds-total-limit` | 动作后单方累计下注 > `totalBetLimit` | `validateBetAction` |
| `insufficient-air` | call 金额 > 当前方剩余可下注 Air | `validateBetAction` |
| `no-fold-without-pressure` | 场上 Bet = 0 时尝试 fold | `validateBetAction` |
| `no-legal-bet-action` | AI 无任何合法 Bet 动作 | `chooseBetAction` |

## 6. Round Resolution / Calamity（06 文档）

| 错误码 | 触发条件 | 抛出位置 |
| --- | --- | --- |
| `missing-locked-hand` | 缺少玩家或 AI 的 `LockedHand` | `resolveRound` |
| `invalid-escrow` | escrow 字段为负或非整数 | `resolveRound` |
| `duplicate-effective-card` | 一方 `effectiveCards` 内部出现重复 ID | `detectCalamity` |

## 7. AI（08 文档）

| 错误码 | 触发条件 | 抛出位置 |
| --- | --- | --- |
| `no-solvable-number-card` | AI 剩余数字牌全部不可解 | `chooseLowerNumberCard` |
| `no-upper-hand-candidates` | AI 候选成手为空 | `chooseUpperHand` |
| `all-in-cooldown` | 上次 all-in 后不足 1 回合 | `checkAllInAllowed` |
| `all-in-exhausted` | 本局 AI 已 all-in 2 次 | `checkAllInAllowed` |
| `ai-honest-info-access` | AI 访问了 DTO 上未声明字段（运行期检测） | AI 函数入口断言 |

## 8. Game State（07 文档）

| 错误码 | 触发条件 | 抛出位置 |
| --- | --- | --- |
| `wrong-phase` | 当前 phase 不允许此 action | `gameReducer` |
| `invalid-hand-selection` | `handId` 不在当前候选成手列表 | `lockPlayerHand` |
| `missing-ai-locked-hand` | 进入 Bet 时 AI 仍未锁定成手 | `enterBetting` |
| `cannotPayBreathingCost` | 某方 Air 不足 1 支付呼吸成本 | `applyRoundCosts` |
| `cannotPayAnte` | 某方 Air 不足 R 支付参加费 | `applyRoundCosts` |

## 9. App / Persistence（09 文档）

| 错误码 | 触发条件 | 抛出位置 |
| --- | --- | --- |
| `storage-unavailable` | localStorage 抛错 | `saveSettings` / `saveLastResult` |
| `invalid-seed` | seed 为空或非字符串/数字 | `createSeededRng` |
| `crypto-unavailable` | `crypto.getRandomValues` 不可用 | `createRuntimeSeed`（内部降级，不抛出） |

## 10. UI（10 文档）

| 错误码 | 触发条件 | 抛出位置 |
| --- | --- | --- |
| `command-rejected` | commands 在错误 phase 或非法输入 | `useGameController` 各 commands |
| `panel-already-open` | 打开已打开的面板 | `openPanel` |
| `no-panel-open` | 关闭未打开的面板 | `closePanel` |
| `confirm-cancelled` | 危险动作二次确认被取消（不视为错误，仅日志） | `confirmDangerousAction` |

## 11. 错误响应外壳

所有错误响应统一为：

```ts
type ErrorPayload = {
  code: string          // 错误码，本表维护
  message: string       // 人类可读消息，i18n key（V1 简体中文）
  phase?: GamePhase     // 错误发生时的 phase（仅 reducer / hook 层）
  details?: unknown     // 调试用，不参与业务逻辑
}
```

UI 层根据 `code` 决定展示策略（toast / inline 提示 / 阻断操作）；`message` 仅用于辅助展示，不参与规则判断。
