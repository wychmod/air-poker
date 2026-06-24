# 05. BettingEngine 实现设计

## 目标

生成下注阶段的合法动作，校验玩家和 AI 的 Bet 行为，并执行 V1 的多轮下注收敛规则。BettingEngine 不关心牌型，只关心 Air、下注额、行动方和阶段约束。

V1 下注为多轮下注：玩家先动，双方轮流行动；任一方不再 raise（即 check / call / fold）或 all-in 即收敛。Raise 受德州 min-raise 约束（增量 ≥ 上次 raise 增量），由 Air 与 totalBetLimit 自然终止，**不设固定轮数上限**。

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
type BetStatus = "awaitingPlayer" | "awaitingAi" | "closed"

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
  lastRaiseIncrement: number            // 上次 raise 的增量；无 raise 历史时为 0
  raiseCount: number                    // 本回合 raise 次数（调试/UI 用，不作为收敛主依据）
  turnStartedAt: number | null          // 进入当前行动方回合的时间戳（ms），供 hook 计算 30s 倒计时
}
```

`playerAvailableAir` 和 `aiAvailableAir` 是扣除呼吸成本、参加费之后剩余可下注 Air。已经扣除的 Air 不再进入 Bet 上限。

> V1 多轮下注不再有「玩家最终只能 call/allIn/fold」的专属状态。玩家每次轮到自己时与首轮动作集合一致（受当前压力与 min-raise 约束裁剪）。原单轮设计的 `awaitingPlayerResponse` / `playerResponseRequired` 已废弃。

`lastAggressor` / `lastRaiseIncrement` / `raiseCount` 更新规则（V1 钉死）：

- 初始：`lastAggressor = null`、`lastRaiseIncrement = 0`、`raiseCount = 0`。
- `bet`：把首注投入记为下注；`lastAggressor = actor`；`lastRaiseIncrement` **不变**（bet 不是 raise，不建立 min-raise 基准）；`raiseCount` 不变。
- `raise`：`lastAggressor = actor`；`lastRaiseIncrement = 本次 raise 增量`；`raiseCount += 1`。
- `allIn`：`lastAggressor = actor`；`lastRaiseIncrement` **不变**（all-in 后对方不能再 raise）；`raiseCount` 不变（all-in 不计为 raise）。
- `check / call / fold`：三者都不更新 `lastAggressor` / `lastRaiseIncrement` / `raiseCount`，但 `check / call / fold` 触发收敛判定（详见收敛规则）。
- 状态进入 `closed` 时字段保持最终值，供结算与回合记录读取。

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
- `lastRaiseIncrement = 0`
- `raiseCount = 0`
- `turnStartedAt = null`（由调用方在进入 awaitingPlayer 时写入 `Date.now()`）

失败方式：

- Air 为负数或非整数时抛出 `invalid-available-air`。

### `getLegalBetActions(state, actor): LegalBetAction[]`

作用：根据当前 BetState 和行动方生成合法动作列表。

参数：

- `state`: 当前 Bet 状态。
- `actor`: 当前尝试行动的一方。

返回：

- 每个动作包含 `type`、`minAmount`、`maxAmount`。
- `raise` 的 `minAmount` = `getMinRaiseIncrement(state, actor)`，`maxAmount` = `getMaxRaiseAmount(state, actor)`。
- `bet` 的 `minAmount` = 1，`maxAmount` = `getMaxBetAmount(state, actor)`（仅首注阶段可用）。
- 不合法但 UI 需要展示的动作可以返回 `disabledReason`。

多轮下的动作裁剪规则：

- 场上 Bet 总额为 0（首注阶段）：`check` / `bet` 合法；`raise` 非法（无 raise 历史，走 `bet`）；`fold` 禁用（`no-fold-without-pressure`）。
- 场上已有 Bet 且轮到当前方：`call` / `raise` / `fold` / `allIn` 合法；`bet` 非法（已有下注，不能再首注）；`check` 仅在 `getCallAmount(state, actor) === 0` 时合法（双方下注相等）。
- `allIn` 后轮到对方：对方只能 `call`（跟到 totalBetLimit 截断）或 `fold`；`raise` / `bet` / `check` 非法。

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

`normalizedAction` 用于修正 all-in 实际投入额。例如玩家 Air 10、AI Air 6，玩家 all-in 时实际只投入 6（被 `totalBetLimit` 截断）。`normalizedAction.amount` 是 `action.amount` 经过裁剪后的真实投入额，**等于 `actorCurrentBet` 增量**。

**`validateBetAction` 单独存在的原因**：供 `getLegalBetActions` 之外的 UI 预校验使用——例如 `useGameController` 在玩家点击 `raise 5` 之前预校验金额，给玩家即时反馈。`applyBetAction` 内部**仍必须**调用 `validateBetAction` 做防御性二次校验，因为游戏内 reducer 不能信任上游预校验。

失败原因（对应 `errors.md` §5）：

- `not-current-actor`
- `invalid-amount`
- `action-not-legal`
- `raise-exceeds-limit`（raise 增量超过 maxRaise）
- `raise-increment-below-minimum`（raise 增量 < minRaise，违反 min-raise）
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

状态推进（V1 多轮钉死）：

- 玩家动作后 → `awaitingAi`（除非动作直接收敛，见下）。
- AI 动作后 → `awaitingPlayer`（除非动作直接收敛，见下）。
- 收敛触发（任一即进入 `closed`）：
  - `fold`：立即收敛。
  - `call`：补齐到对方下注额后收敛（双方下注相等）。
  - `check`：仅在无压力（双方下注相等）时合法，check 后收敛。
  - `allIn`：对方响应 `call` / `fold` 后收敛；all-in 本身不立即收敛，轮到对方。
- 不收敛的动作（继续轮到对方）：
  - `bet`：首注后轮到对方。
  - `raise`：加注后轮到对方，对方可再 raise（受 min-raise）。

### `getCallAmount(state, actor): number`

作用：计算当前行动方需要补齐的 call 金额。

参数：

- `state`
- `actor`

返回：

- `max(opponentBet - actorBet, 0)`。
- 若 `actorBet >= opponentBet` 返回 0（此时 `call` 不可用，`check` 走独立路径）。

### `getTotalBetLimit(state): number`

作用：计算本回合单方累计下注上限。

参数：

- `state`

返回：

- `min(playerAvailableAir + playerBet, aiAvailableAir + aiBet)`。

用途：

- bet、raise、all-in 校验。
- UI 显示"本回合最多可投入 X Air"。

### `getMaxBetAmount(state, actor): number`

作用：计算首注阶段 `bet` 的最大金额。

参数：

- `state`
- `actor`

返回：

- `totalBetLimit - actorBet`（首注阶段 `actorBet = 0`，即等于 `totalBetLimit`）。
- 首注阶段以外返回 0（`bet` 非法）。

### `getMinRaiseIncrement(state, actor): number`

作用：计算当前行动方本次 raise 的最小增量（德州 min-raise）。

参数：

- `state`
- `actor`

返回：

- `lastRaiseIncrement > 0 ? lastRaiseIncrement : 1`。
- 首注阶段（无 raise 历史）raise 非法，调用方应走 `bet` 路径；本函数仅在 raise 合法时被参考。

V1 钉死：每次 raise 的增量必须 ≥ `getMinRaiseIncrement`，否则 `raise-increment-below-minimum`。首次面对 bet 的 raise 增量 ≥ 1。

### `getMaxRaiseAmount(state, actor): number`

作用：计算当前行动方本次 raise 的增量上限。

参数：

- `state`
- `actor`

返回：

- `min(actorAvailableAir, totalBetLimit - actorBet - opponentBet + actorBet)` 的简化口径：raise 后单方累计下注不得超过 `totalBetLimit`，故增量上限 = `min(actorAvailableAir, totalBetLimit - actorBet)`。
- **首注阶段（场上 Bet = 0）返回 0**——`raise` 在无已有下注时非法（走 `bet` 路径）。
- **all-in 已发生（对方 all-in 后轮到本方）返回 0**——对方 all-in 后本方只能 `call` / `fold`，不能再 raise。
- 公式结果小于 `getMinRaiseIncrement` 时返回 0（普通 raise 不合法，但仍可 `call` / `fold` / `allIn`）。

> V1 不再使用「Raise 上限 = 场上总 Bet 的 1/2」口径。Raise 上限由 min-raise（下界）+ 剩余 Air + totalBetLimit（上界）三重约束共同决定。

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

- **仅在 Bet 阶段玩家回合生效**。多轮下注中玩家每次轮到自己都启动定时器，状态切换或玩家主动提交动作时清理并重启。
- AI 决策不计时；AI 由 `useGameController` 同步或微任务调用，不设超时。
- 下层（lowerSelect）、上层（upperSelect）、showdown 阶段不计时。
- 玩家超时由 `useGameController` 内部 `setTimeout` 触发；定时器在 `state.phase === "betting"` 且 `state.currentRound.betState.status === "awaitingPlayer"` 时启动，状态变化或玩家主动提交动作时清理。

## 首注规则

当场上 Bet 总额为 0：

- `check` 合法。
- `bet` 合法，金额为 1 到 `getMaxBetAmount`。
- `raise` **不合法**（`getLegalBetActions` 直接排除，`getMaxRaiseAmount` 返回 0）——因为还没有可加注对象，首注走 `bet`。
- `fold` **不合法**（`getLegalBetActions` 给出 `disabledReason: "no-fold-without-pressure"`）——无下注压力时不允许无意义弃牌。

## Raise 约束

当场上已有 Bet（存在 `lastAggressor` 或任一方 `Bet > 0`）：

```text
minRaise = getMinRaiseIncrement(state, actor)   // = max(1, lastRaiseIncrement)
maxRaise = getMaxRaiseAmount(state, actor)       // = min(actorAvailableAir, totalBetLimit - actorBet)
```

- 普通 `raise` 增量必须满足 `minRaise ≤ 增量 ≤ maxRaise`。
- 增量 < `minRaise` → `raise-increment-below-minimum`。
- 增量 > `maxRaise` → `raise-exceeds-limit`。
- `maxRaise < minRaise` 时普通 `raise` 不合法，玩家仍可 `call`、`fold`，或在 Air 允许时 `allIn`。
- 动作后当前方累计下注额不得超过 `totalBetLimit`。

本回合总 Bet 上限：

```text
totalBetLimit = min(playerAvailableAir + playerBet, aiAvailableAir + aiBet)
```

这里加回当前已下注额，是因为下注额已经从可用 Air 中移入 escrow。任何动作后的单方累计下注额都不能超过 `totalBetLimit`。

## all-in 实际投入额与收敛示例

### 示例 1：首注 all-in 受 totalBetLimit 截断

玩家 Air = 10，AI Air = 6，场上总 Bet = 0，玩家首注 all-in：

- `totalBetLimit = min(10 + 0, 6 + 0) = 6`。
- 玩家 `allIn` 投入 6，`normalizedAction.amount = 6`，`playerBet = 6`，`lastAggressor = "player"`。
- 轮到 AI（all-in 不立即收敛）：AI 只能 `call` / `fold`，不能 `raise` / `bet` / `check`。
  - AI `call`：补齐 6；`aiBet = 6`，双方相等 → `closed`。
  - AI `fold`：玩家赢，`closed`。

### 示例 2：低 Air 方首注 all-in 后对方无 raise 空间

玩家 Air = 5，AI Air = 12，场上总 Bet = 0，玩家首注 all-in：

- `totalBetLimit = min(5 + 0, 12 + 0) = 5`。
- 玩家 `allIn` 投入 5，`normalizedAction.amount = 5`。
- 轮到 AI：AI 只能 `call` / `fold`（对方 all-in 后不能再 raise）。
  - AI `call` 5，`closed`。
  - AI `fold`，玩家赢。

### 示例 3：多轮 raise 往返至收敛

玩家 Air = 25，AI Air = 25，场上总 Bet = 0：

1. 玩家 `bet` 3：`playerBet = 3`，`lastAggressor = "player"`，`lastRaiseIncrement = 0`（bet 不建立 raise 基准）。轮到 AI。
2. AI `raise` +2（AI 下注从 0 到 5，增量 5？——见下文口径说明）。**口径说明**：raise 增量指「本次动作使本方下注额的增加量」。AI 从 0 raise 到 5，增量 = 5；`lastRaiseIncrement = 5`，`raiseCount = 1`。轮到玩家。
3. 玩家 `raise`：增量必须 ≥ `lastRaiseIncrement = 5`。玩家从 3 raise 到 9（增量 6 ≥ 5 合法），`lastRaiseIncrement = 6`，`raiseCount = 2`。轮到 AI。
4. AI `raise` 增量必须 ≥ 6。AI 从 5 raise 到 12（增量 7 ≥ 6 合法），`lastRaiseIncrement = 7`，`raiseCount = 3`。轮到玩家。
5. 玩家 `call`：补齐到 12（增量 3），`playerBet = 12`，双方相等 → `closed`。

> **raise 增量口径（V1 钉死）**：raise 增量 = `本次动作后 actorBet - 本次动作前 actorBet`，即本方下注额的净增加量，**不是**「相对对方下注额的超出量」。min-raise 约束比较的是相邻两次 raise 的「本方下注额净增加量」。这与德州 min-raise「本次加注幅度 ≥ 上次加注幅度」一致。

### 示例 4：min-raise 违反

接示例 3 步骤 3 之后，若玩家试图 `raise` 增量 = 4（< `lastRaiseIncrement = 5`）→ `raise-increment-below-minimum`，动作被拒，状态不变。

## 动作规则

`check`:

- 当前行动方无需跟注。
- 仅在双方下注相等（`getCallAmount === 0`）时合法。
- 不改变下注额。check 后收敛。

`call`:

- 当前行动方面对对方更高下注额。
- 补齐到对方当前下注额。
- 若 Air 不足以完整 call，则 `call` 不合法（改用 `allIn` 跟到上限或 `fold`）。
- call 后双方下注相等 → 收敛。

`bet`:

- 仅场上总 Bet 为 0 时可用。
- 金额为 1 到 `getMaxBetAmount`。
- bet 后轮到对方。

`raise`:

- 面对已有下注时可用。
- 增量为 `getMinRaiseIncrement` 到 `getMaxRaiseAmount`。
- 动作后当前方累计下注额不得超过 `totalBetLimit`。
- raise 后轮到对方，对方可再 raise（受新的 min-raise）。

`allIn`:

- 当前方剩余可下注 Air 大于 0。
- 实际投入额不能超过 `totalBetLimit - actorCurrentBet`。
- 如果玩家 Air 高于 AI Air，all-in 实际只投入到 AI 可覆盖的上限。
- all-in 后轮到对方，对方只能 `call` / `fold`，不能再 `raise` / `bet` / `check`。

`fold`:

- 面对下注压力时可用。
- 无下注压力时 V1 默认禁用。
- fold 后立即收敛。

## 收敛规则

V1 多轮下注收敛（钉死）：

1. 进入 Bet 时状态为 `awaitingPlayer`。
2. 玩家与 AI 轮流行动。
3. 任一方 `check / call / fold` → Bet 关闭：
   - `check`：仅无压力时合法，check 即收敛。
   - `call`：补齐后双方下注相等，收敛。
   - `fold`：立即收敛。
4. 任一方 `raise` → 轮到对方响应，对方可再 `raise`（受 min-raise），也可 `call / fold / allIn`。
5. 任一方 `allIn` → 对方只能 `call`（跟到 totalBetLimit 截断）或 `fold`，响应后收敛。
6. Air 耗尽由 `totalBetLimit` 与各方剩余可下注 Air 自然终止：剩余可下注 Air = 0 的一方无法再 `bet / raise`，只能 `check / call / fold`。

**不设固定轮数上限**：靠「不 raise 即收敛」+「Air / totalBetLimit 自然终止」杜绝无限加注。不引入 `max-raise-rounds` 硬上限与对应错误码。

## 30 秒超时

超时动作由调用方触发，但动作选择规则属于 BettingEngine。详见 `getTimeoutBetAction` 段。多轮下注中玩家每次回合都重置 30 秒定时器。

## 测试要求

- 初始场上 0 Bet 时，check 和 bet 合法，raise **不合法**（`disabledReason: "action-not-legal"`），fold **不合法**（`disabledReason: "no-fold-without-pressure"`）。
- 面对下注时 call、raise、fold 合法性正确。
- **min-raise 约束**：第二次 raise 增量 < 第一次 raise 增量 → `raise-increment-below-minimum`；增量 ≥ 上次 raise 增量合法。
- raise 增量超过 `maxRaise` → `raise-exceeds-limit`。
- 动作后单方累计下注额不超过 `totalBetLimit`。
- **多轮往返收敛**：玩家 bet → AI raise → 玩家 raise → AI call → closed。
- **玩家不 raise 即收敛**：玩家 bet → AI raise → 玩家 call → closed。
- **AI 不 raise 即收敛**：玩家 bet → AI call → closed。
- **all-in 后只能 call/fold**：玩家 all-in → AI 不能 raise/bet/check，只能 call/fold；AI call → closed。
- `lastRaiseIncrement` 在 raise 后更新为本次增量；bet / allIn 不更新。
- `raiseCount` 仅 raise 时 +1。
- 30s 超时策略按 check 优先，否则 fold（V1 不替玩家自动 call 有金额的 call）。
- 30s 定时器在多轮切换行动方时正确清理与重启（每次 `status === "awaitingPlayer"` 启动，状态变化清理）。
- `turnStartedAt` 在每次切换行动方时刷新为 `Date.now()`。
- `applyBetAction` 内部对 `action` 调用 `validateBetAction` 二次校验，传入非法 action 时返回 `{ ok: false, code: "action-not-legal" }` 等，不修改 state。
- all-in 金额被较低 Air 方上限截断（玩家 Air 10 / AI Air 6 → 玩家 all-in 实际投入 6）。
- raise 增量口径 = 本方下注额净增加量（非相对对方的超出量），min-raise 比较相邻两次 raise 的净增加量。

## 实现注意

- BettingEngine 不直接修改 GameState；它返回新的 BetState 或校验结果，由 game reducer 合并。
- BettingEngine 不读取成手、牌型、AI 评分。
- 所有金额使用整数 Air，不允许小数。
- min-raise 计算依赖 `lastRaiseIncrement`，raise 增量必须整数 Air；`getMinRaiseIncrement` 仅在 raise 合法时被参考。
- raise 增量口径统一为「本方下注额净增加量」，实现时 `lastRaiseIncrement` 与 `getMinRaiseIncrement` 必须基于该口径，不要混入「相对对方下注的超出量」。
