# 05. BettingEngine 实现设计

## 目标

生成下注阶段的合法动作，校验玩家和 AI 的 Bet 行为，并执行 V1 的一轮收敛规则。BettingEngine 不关心牌型，只关心 Air、下注额、行动方和阶段约束。

## 依赖

- `01-cards-rng-and-deck.md` 中的基础类型风格

## 建议文件

- `src/domain/betting/betting-rules.ts`
- `src/domain/betting/betting-engine.ts`
- `src/domain/betting/betting-engine.test.ts`

错误码统一在 `errors.md` §5 维护。

## 核心类型

```ts
type BetActor = "player" | "ai"
type BetActionType = "check" | "call" | "bet" | "raise" | "fold" | "allIn"
type BetStatus = "awaitingPlayer" | "awaitingAi" | "awaitingPlayerResponse" | "closed"

type BetAction = {
  actor: BetActor
  type: BetActionType
  amount: number                        // 本次动作实际投入的 Air；check/fold 时为 0
}

type BetState = {
  playerBet: number                     // 玩家本回合累计下注额
  aiBet: number                         // AI 本回合累计下注额
  playerAvailableAir: number            // 玩家扣完呼吸 + 参加费后剩余可下注 Air
  aiAvailableAir: number                // AI 扣完呼吸 + 参加费后剩余可下注 Air
  status: BetStatus
  lastAggressor: BetActor | null        // 最近一次 bet/raise/allIn 的行动方
  playerResponseRequired: boolean       // 仅在 AI raise/allIn 后置 true
  turnStartedAt: number | null          // 进入当前行动方回合的时间戳（ms），供 hook 计算 30s 倒计时
}

type LegalBetAction = {
  type: BetActionType
  minAmount: number                     // 该动作的最小合法金额
  maxAmount: number                     // 该动作的最大合法金额
  disabledReason?: string               // 不合法时填错误码（见 errors.md §5）
}
```

`playerAvailableAir` 和 `aiAvailableAir` 是扣除呼吸成本、参加费之后剩余可下注 Air。已经扣除的 Air 不再进入 Bet 上限。

`lastAggressor` 与 `playerResponseRequired` 的更新规则（V1 钉死）：

- 初始：`lastAggressor = null`、`playerResponseRequired = false`。
- 玩家 `bet / raise / allIn` 后：`lastAggressor = "player"`，`playerResponseRequired = false`。
- AI `bet / raise / allIn` 后：`lastAggressor = "ai"`，`playerResponseRequired = true`。
- `check / call / fold` 后：`lastAggressor` 不更新；`playerResponseRequired` 仅在 AI fold 时置 false（理论上 AI fold 不会进入 awaitingPlayerResponse，本规则仅防御性）。
- 状态进入 `closed` 时 `playerResponseRequired` 重置为 `false`。

## 详细 API 契约

### `createInitialBetState(input): BetState`

作用：进入 Bet 阶段时创建下注状态。

参数：

- `playerAvailableAir`: 玩家扣除呼吸和参加费后剩余可下注 Air。
- `aiAvailableAir`: AI 扣除呼吸和参加费后剩余可下注 Air。

返回：

- `playerBet = 0`
- `aiBet = 0`
- `status = "awaitingPlayer"`
- `lastAggressor = null`
- `playerResponseRequired = false`

失败方式：

- Air 为负数或非整数时抛出 `invalid-available-air`。

### `getLegalBetActions(state, actor): LegalBetAction[]`

作用：根据当前 BetState 和行动方生成合法动作列表。

参数：

- `state`: 当前 Bet 状态。
- `actor`: 当前尝试行动的一方。

返回：

- 每个动作包含 `type`、`minAmount`、`maxAmount`。
- 不合法但 UI 需要展示的动作可以返回 `disabledReason`。

失败方式：

- `actor` 不是当前行动方时返回所有动作 disabled，原因 `not-current-actor`。
- `state.status = closed` 时返回空数组或全部 disabled，原因 `betting-closed`。

调用方：

- BettingPanel 按钮启用状态。
- AI 决策动作裁剪。
- 超时动作选择。

### `validateBetAction(state, action): BetValidationResult`

作用：校验一个 BetAction 是否可执行。

参数：

- `state`: 当前 Bet 状态。
- `action`: 玩家或 AI 提交的动作。

返回：

- 成功：`{ ok: true, normalizedAction }`。
- 失败：`{ ok: false, code, legalActions }`。

`normalizedAction` 用于修正 all-in 实际投入额。例如玩家 Air 10、AI Air 6，玩家 all-in 时实际只投入 6（被 `totalBetLimit` 截断）。`normalizedAction.amount` 是 `action.amount` 经过裁剪后的真实投入额，**等于 `actorCurrentBet` 增量**——若玩家此前下注 0，all-in 6 后 `normalizedAction.amount = 6`，下注后 `playerBet = 6`。

**`validateBetAction` 单独存在的原因**：供 `getLegalBetActions` 之外的 UI 预校验使用——例如 `useGameController` 在玩家点击 `bet 5` 之前预校验金额，给玩家即时反馈。`applyBetAction` 内部**仍必须**调用 `validateBetAction` 做防御性二次校验，因为游戏内 reducer 不能信任上游预校验。

失败原因（对应 `errors.md` §5）：

- `not-current-actor`
- `invalid-amount`
- `action-not-legal`
- `raise-exceeds-limit`
- `bet-exceeds-total-limit`
- `insufficient-air`
- `no-fold-without-pressure`（场上 Bet = 0 时 fold）
- `betting-closed`

### `applyBetAction(state, action): ApplyBetActionResult`

作用：执行已经校验通过的下注动作，返回下一 BetState。

参数：

- `state`: 当前 Bet 状态。
- `action`: 待执行动作。实现内部仍必须调用 `validateBetAction` 防御非法输入。

返回：

- 成功：`{ ok: true, state, event }`。
- `event`: 用于回合记录，例如 `{ actor, type, amountCommitted, previousBet, nextBet }`。
- 失败：同 `validateBetAction`。

状态推进：

- 玩家初次动作后进入 `awaitingAi`。
- AI `check/call/fold` 后进入 `closed`。
- AI `raise/allIn` 后进入 `awaitingPlayerResponse`。
- 玩家响应后进入 `closed`。

### `getCallAmount(state, actor): number`

作用：计算当前行动方需要补齐的 call 金额。

参数：

- `state`
- `actor`

返回：

- `max(opponentBet - actorBet, 0)`。
- 若 `actorBet >= opponentBet` 返回 0（此时 `call` 等同 `check`，但 `check` 走独立判断路径，详见下方 check 规则）。

### `getTotalBetLimit(state): number`

作用：计算本回合单方累计下注上限。

参数：

- `state`

返回：

- `min(playerAvailableAir + playerBet, aiAvailableAir + aiBet)`。

用途：

- bet、raise、all-in 校验。
- UI 显示"本回合最多可投入 X Air"。

### `getMaxRaiseAmount(state, actor): number`

作用：计算当前行动方的最大 raise 增量。

参数：

- `state`
- `actor`

返回：

- `floor((playerBet + aiBet) / 2)` 与 `actorAvailableAir + actorBet - actorBet = actorAvailableAir` 的较小值（即 V1 简化版：直接返回 `min(maxRaiseRaw, actorAvailableAir)`）。
- **首注阶段（场上 Bet = 0）返回 0**——`raise` 在无已有下注时非法（走 `bet` 路径）。这与 `getLegalBetActions` 排除 `raise` 的行为一致。
- 公式 raw 小于 1 时返回 0。

### `getTimeoutBetAction(state, actor): BetAction`

作用：根据 V1 超时规则生成自动动作。

参数：

- `state`
- `actor`

返回：

- 可 `check` 时返回 `check`。
- 否则若 `call` 合法且 `getCallAmount(state, actor) === 0`（即双方下注相等），返回 `check`。
- 否则若 `call` 合法但 call 金额 > 0，**不**自动 call，返回 `fold`（V1 不替玩家承担风险）。
- 否则返回 `fold`。

失败方式：

- 如果 actor 不是当前行动方，返回 `{ ok: false, code: "not-current-actor" }`，调用方应不触发超时。

**30 秒超时的覆盖范围（V1 钉死）**：

- **仅在 Bet 阶段玩家回合生效**。
- AI 决策不计时；AI 由 `useGameController` 同步或微任务调用，不设超时。
- 下层（lowerSelect）、上层（upperSelect）、showdown 阶段不计时。
- 玩家超时由 `useGameController` 内部 `setTimeout` 触发；定时器在 `state.phase === "betting"` 且 `state.currentRound.betState.status === "awaitingPlayer"` 时启动，状态变化或玩家主动提交动作时清理。

## 首注规则

当场上 Bet 总额为 0：

- `check` 合法。
- `bet` 合法，金额为正整数。
- 首注最大值不超过本回合总 Bet 上限 `totalBetLimit`。
- `raise` **不合法**（`getLegalBetActions` 直接排除，`getMaxRaiseAmount` 返回 0）——因为还没有可加注对象。
- `fold` **不合法**（`getLegalBetActions` 给出 `disabledReason: "no-fold-without-pressure"`）——无下注压力时不允许无意义弃牌。

## Raise 上限

当场上已有 Bet：

```text
maxRaise = floor((playerBet + aiBet) / 2)
```

若 `maxRaise < 1`，则普通 `raise` 不合法。玩家仍可 `call`、`fold`，或在可下注 Air 允许时 `allIn`。

本回合总 Bet 上限：

```text
totalBetLimit = min(playerAvailableAir + playerBet, aiAvailableAir + aiBet)
```

这里加回当前已下注额，是因为下注额已经从可用 Air 中移入 escrow。任何动作后的单方累计下注额都不能超过 `totalBetLimit`。

## all-in 实际投入额示例

玩家 Air = 10，AI Air = 6，场上总 Bet = 0，玩家首注 all-in：

- `totalBetLimit = min(10 + 0, 6 + 0) = 6`。
- 玩家 `allIn` 投入 6，`normalizedAction.amount = 6`。
- AI 收到 awaitingPlayer 之后 → AI 响应：
  - AI `call`：补齐 6；`aiBet = 6`，`playerBet = 6`，双方相等 → `closed`。
  - AI `fold`：玩家赢 AI 投入 0，AI 不损失 Air（没投）；但 AI 已扣呼吸 + 参加费。
  - AI `raise`：受 `totalBetLimit = 6` 限制，最多 raise 到 6（增量 6）→ 等同 all-in。
  - AI `allIn`：投入 6，bet closed。

玩家 Air = 5，AI Air = 12，场上总 Bet = 0，玩家首注 all-in：

- `totalBetLimit = min(5 + 0, 12 + 0) = 5`。
- 玩家 `allIn` 投入 5，`normalizedAction.amount = 5`。
- AI `call` 5，`closed`。
- AI 可选 raise，但被 `totalBetLimit = 5` 限制，raise 增量上限为 `min(floor(5/2)=2, 12-0=12) = 2`，最多下注 5+2=7 → **不允许**（超过 `totalBetLimit`），实际 raise 增量被截断为 0，等同 call。
- AI 只能 `call` / `fold`，不能加注。

## 动作规则

`check`:

- 当前行动方无需跟注。
- 不改变下注额。

`call`:

- 当前行动方面对对方更高下注额。
- 补齐到对方当前下注额。
- 若 Air 不足以完整 call，则 `call` 不合法。

`bet`:

- 仅场上总 Bet 为 0 时可用。
- 金额为 1 到 `totalBetLimit`。

`raise`:

- 面对已有下注时可用。
- 增量为 1 到 `maxRaise`。
- 动作后当前方累计下注额不得超过 `totalBetLimit`。

`allIn`:

- 当前方剩余可下注 Air 大于 0。
- 实际投入额不能超过 `totalBetLimit - actorCurrentBet`。
- 如果玩家 Air 高于 AI Air，all-in 实际只投入到 AI 可覆盖的上限。

`fold`:

- 面对下注压力时可用。
- 无下注压力时 V1 默认禁用。

## 收敛规则

1. 进入 Bet 时状态为 `awaitingPlayer`。
2. 玩家动作后进入 `awaitingAi`。
3. AI `check/call/fold` 后 Bet 关闭。
4. AI `raise/allIn` 后进入 `awaitingPlayerResponse`。
5. 玩家最终响应只能是 `call/allIn/fold`。
6. 玩家最终响应后 Bet 必定关闭。

不允许继续加注循环。

## 30 秒超时

超时动作由调用方触发，但动作选择规则属于 BettingEngine。详见 `getTimeoutBetAction` 段。

## 测试要求

- 初始场上 0 Bet 时，check 和 bet 合法，raise **不合法**（`disabledReason: "action-not-legal"`），fold **不合法**（`disabledReason: "no-fold-without-pressure"`）。
- 面对下注时 call、raise、fold 合法性正确。
- Raise 增量不超过场上总 Bet 的一半。
- 场上总 Bet 为 1 时普通 raise 不合法。
- 动作后单方累计下注额不超过 `totalBetLimit`。
- 玩家动作 -> AI 响应 -> closed。
- AI raise -> 玩家最终响应 -> closed。
- 玩家最终响应阶段 `playerResponseRequired = true`，`getLegalBetActions("player")` 排除 `bet / raise`，只允许 `call / allIn / fold`。
- all-in 金额被较低 Air 方上限截断（玩家 Air 10 / AI Air 6 → 玩家 all-in 实际投入 6）。
- 超时策略按 check 优先，否则 fold（V1 不替玩家自动 call 有金额的 call）。
- `lastAggressor` 与 `playerResponseRequired` 更新规则按上文约定：玩家 raise → `lastAggressor = "player"`；AI raise → `lastAggressor = "ai"` 且 `playerResponseRequired = true`。
- `turnStartedAt` 在每次切换行动方时刷新为 `Date.now()`。
- `applyBetAction` 内部对 `action` 调用 `validateBetAction` 二次校验，传入非法 action 时返回 `{ ok: false, code: "action-not-legal" }` 等，不修改 state。

## 实现注意

- BettingEngine 不直接修改 GameState；它返回新的 BetState 或校验结果，由 game reducer 合并。
- BettingEngine 不读取成手、牌型、AI 评分。
- 所有金额使用整数 Air，不允许小数。
