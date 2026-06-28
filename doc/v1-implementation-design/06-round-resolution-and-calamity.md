# 06. 回合结算与灾厄实现设计

## 目标

统一处理摊牌后的牌型胜负、Bet escrow、参加费、灾厄、弃牌区和 Air 归零检查。此模块是账本正确性的核心。

## 依赖

- `01-cards-rng-and-deck.md`
- `04-hand-evaluator.md`
- `05-betting-engine.md`

## 建议文件

- `src/domain/calamity/calamity-engine.ts`
- `src/domain/game/round-resolution.ts`
- `src/domain/game/round-resolution.test.ts`
- `src/domain/calamity/calamity-engine.test.ts`

错误码统一在 `errors.md` §6 维护。

## 核心类型

```ts
type RoundWinner = "player" | "ai" | "tie"
type FoldState = "none" | "playerFolded" | "aiFolded"

type RoundEscrow = {
  playerAnte: number                    // 玩家本回合参加费（R Air）
  aiAnte: number                        // AI 本回合参加费（R Air）
  playerBet: number                     // 玩家本回合下注额
  aiBet: number                         // AI 本回合下注额
}

type LockedHand = {
  selectedCards: Card[]                 // 长度 5，玩家表面选的 5 张
  effectiveCards: Card[]                // selectedCards 去掉 used 后的子集，长度 0..5
  evaluatedHand: EvaluatedHand          // 基于 effectiveCards 的评价结果
}

type CalamityResult = {
  triggered: boolean
  overlappingCardIds: CardId[]          // 双方 effectiveCards 交集，按 id 字典序升序
  loser: "player" | "ai" | null         // 非 fold 情况下 loser = winner 的反面
  vanishedAir: number                   // 灾厄额外扣减的 Air，可能为 0
}

type AirDelta = {
  player: number                        // 玩家本回合 Air 净变化（含 ante、bet、灾厄）
  ai: number                            // AI 本回合 Air 净变化
}

type EscrowDistribution = {
  playerReceivedAnte: number            // 玩家拿回的参加费
  aiReceivedAnte: number                // AI 拿回的参加费
  playerReceivedBet: number             // 玩家从 Bet escrow 拿到的金额（胜方含对手下注，平手拿回自己）
  aiReceivedBet: number                 // 同上
}

type RoundResolution = {
  winner: RoundWinner
  reason: "handComparison" | "playerFolded" | "aiFolded" | "exactTie"
  airDelta: AirDelta
  calamity: CalamityResult
  discardCardIds: CardId[]              // 双方 effectiveCards 去重 ID（不含 burnCards，不含失效用过牌）
  escrowDistribution: EscrowDistribution
  vanishedAir: number                   // 灾厄消失 + 负方 ante 消失的总和
}

type RoundResolutionResult =
  | { ok: true; resolution: RoundResolution }
  | { ok: false; code: "missing-locked-hand" | "invalid-escrow" }
```

> `returnedAir` 字段已改名为 `escrowDistribution`，因为"退还"语义只对平手完整成立；胜方拿到的"含对手下注"不是退还。详见下文。

## 详细 API 契约

### `resolveRound(input): RoundResolutionResult`

作用：执行完整回合结算，包括胜负、参加费、Bet、灾厄和弃牌区候选输出。

参数：

```ts
type ResolveRoundInput = {
  playerHand: LockedHand
  aiHand: LockedHand
  foldState: FoldState
  escrow: RoundEscrow
  playerAirAfterEscrow: number          // 扣完呼吸、参加费、下注后的玩家 Air
  aiAirAfterEscrow: number              // 扣完呼吸、参加费、下注后的 AI Air
}
```

返回：

- `{ ok: true, resolution: RoundResolution }`。
- `resolution.winner`: 玩家、AI 或平手。
- `resolution.reason`: 胜负原因。
- `resolution.airDelta`: 从结算前到结算后的净变化。
- `resolution.calamity`: 灾厄结果。
- `resolution.discardCardIds`: 应进入弃牌区的有效牌 ID。
- `resolution.escrowDistribution`: escrow 分配。
- `resolution.vanishedAir`: 灾厄消失 + 负方 ante 消失的总和。
- 当输家 Air 不足时，`vanishedAir` 可能大于实际扣减值。

失败方式：

- 缺少任一 locked hand 时返回 `{ ok: false, code: "missing-locked-hand" }`。
- escrow 中出现负数或非整数时返回 `{ ok: false, code: "invalid-escrow" }`。

调用方：

- `game-reducer` 的 `resolveRound` 系统 action。

### `determineRoundWinner(input): RoundWinnerResult`

作用：只判断本回合牌型或 fold 胜负，不处理 Air。

参数：

```ts
type DetermineRoundWinnerInput = {
  playerEvaluatedHand: EvaluatedHand
  aiEvaluatedHand: EvaluatedHand
  foldState: FoldState
}
```

返回：

```ts
type RoundWinnerResult = {
  winner: RoundWinner
  reason: "handComparison" | "playerFolded" | "aiFolded" | "exactTie"
  compareResult: HandCompareResult      // 仅 foldState === "none" 时有意义
}
```

`reason` 是单一字符串（union），不是数组——fold 与 handComparison 互斥。Fold 状态下 `compareResult` 不参与胜负判定；灾厄判定仍用双方 lockedHand 的 `effectiveCards`，详见下文。

### `settleAnte(escrow, winner): AnteSettlement`

作用：按参加费口径计算参加费退还和消失。

参数：

- `escrow.playerAnte`
- `escrow.aiAnte`
- `winner`

返回：

```ts
type AnteSettlement = {
  playerReceivedAnte: number            // 玩家拿回的参加费
  aiReceivedAnte: number                // AI 拿回的参加费
  vanishedAir: number                   // 负方 ante 消失；平手时为 0
}
```

V1 钉死规则：

- 玩家胜：`playerReceivedAnte = playerAnte`、`aiReceivedAnte = 0`、`vanishedAir = aiAnte`。
- AI 胜：`playerReceivedAnte = 0`、`aiReceivedAnte = aiAnte`、`vanishedAir = playerAnte`。
- 平手且 `reason === "exactTie"`：`playerReceivedAnte = playerAnte`、`aiReceivedAnte = aiAnte`、`vanishedAir = 0`。

### `settleBetEscrow(escrow, winner): BetSettlement`

作用：按 Bet escrow 计算下注退还或转移。

参数：

- `escrow.playerBet`
- `escrow.aiBet`
- `winner`

返回：

```ts
type BetSettlement = {
  playerReceivedBet: number
  aiReceivedBet: number
}
```

V1 钉死规则：

- 玩家胜：`playerReceivedBet = playerBet + aiBet`、`aiReceivedBet = 0`。
- AI 胜：`playerReceivedBet = 0`、`aiReceivedBet = playerBet + aiBet`。
- 平手且 `reason === "exactTie"`：`playerReceivedBet = playerBet`、`aiReceivedBet = aiBet`（各自取回）。

注意：

- 返回的是 escrow 分配，不是额外从对方 Air 扣除。下注已经在 Bet 阶段扣入 escrow，结算时按上述规则从 escrow 转给胜方或退还原主。

### `detectCalamity(playerEffectiveCards, aiEffectiveCards): CalamityDetection`

作用：判断双方有效牌是否重叠。

参数：

- `playerEffectiveCards: Card[]`（长度 0..5）
- `aiEffectiveCards: Card[]`（长度 0..5）

返回：

```ts
type CalamityDetection = {
  triggered: boolean
  overlappingCardIds: CardId[]          // 按 id 字典序升序，见 01 文档附录 B
}
```

V1 钉死规则：

- 双方 `effectiveCards` 任一为空（`length === 0`）时 `triggered = false`（0 vs 0 不算重叠，0 vs N 也不算）。
- 双方都非空时，遍历玩家 `effectiveCards`，检查每张牌的 `id` 是否出现在 AI `effectiveCards` 中。交集写入 `overlappingCardIds`，去重后按字典序排序。
- 任一方 `effectiveCards` 内部出现重复 ID 时抛 `duplicate-effective-card`（`errors.md` §6）——开发错误。

### `applyCalamityPenalty(input): CalamityPenalty`

作用：根据灾厄和输家计算额外 Air 扣减。

参数：

```ts
type ApplyCalamityPenaltyInput = {
  triggered: boolean
  loser: "player" | "ai" | null
  escrow: RoundEscrow
  playerAir: number
  aiAir: number
}
```

返回：

```ts
type CalamityPenalty = {
  playerDeduction: number               // 玩家被额外扣减的 Air
  aiDeduction: number                   // AI 被额外扣减的 Air
  vanishedAir: number                   // 双方额外扣减的总和（不归属任何一方）
}
```

V1 钉死规则：

- 未触发 / `loser === null`：`playerDeduction = aiDeduction = vanishedAir = 0`。
- 玩家输：实际扣减 `min(playerAir, escrow.playerBet)`。**Air 不足时扣到 0**（不能为负）；超出部分仍记入 `vanishedAir` 的"应有值"但不实际扣。
  - 例：玩家输、`escrow.playerBet = 10`、玩家当前 Air = 3 → `playerDeduction = 3`、`vanishedAir = 10`（剩余 7 在概念上属于应有消失额但未实际扣）。
- AI 输：对称处理。

### `collectDiscardCardIds(playerHand, aiHand): CardId[]`

作用：收集本回合应进入弃牌区的有效牌。

参数：

- `playerHand: LockedHand`
- `aiHand: LockedHand`

返回：

- 双方 `effectiveCards` 的去重 ID 列表（按字典序升序）。
- 不包含 `selectedCards` 里的失效用过牌（只来自 `effectiveCards`）。
- 不包含 `burnCards`（burnCards 从不进弃牌区）。

调用方：

- 状态机在 `resolveCurrentRound` 完成后调用本函数，拿到 `discardCardIds` 后，将双方 `effectiveCards` 合并后传给 `01-cards-rng-and-deck.md` 的 `moveEffectiveCardsToDiscard(deckState, effectiveCards)`；该函数内部按 `Card.id` 去重。

## 参加费口径

实现采用 escrow 账本：

1. 回合开始时，双方各扣 `roundNumber` Air 作为参加费，写入 `playerAnte` 和 `aiAnte`。
2. 正常结算时，胜方拿回自己的参加费；负方自己的参加费消失为参赛成本。
3. 平手且完全相同退还下注时，双方拿回自己的参加费。

这个口径匹配“胜方拿回自己那份参加费，负方承担自己那份参加费”。如果后续决定参加费也要转移给胜方，只需要调整 `settleAnte`，不要改 BettingEngine。

## Bet escrow 口径

下注动作发生时，下注额已经从 Air 扣入 escrow。结算时：

- 玩家胜：玩家获得 `playerBet + aiBet`，净收益为 `aiBet`。
- AI 胜：AI 获得 `playerBet + aiBet`，净收益为 `playerBet`。
- 完全平手：双方拿回自己的下注额。

这与“胜者拿到对手下注额”的净变化一致。

## 胜负判定

若无 fold：

1. 调用 `compareEvaluatedHands(playerEvaluatedHand, aiEvaluatedHand)`。
2. 返回 `1` → 玩家胜。
3. 返回 `-1` → AI 胜。
4. 返回 `0` → 平手（`reason = "exactTie"`），按 `settleAnte` / `settleBetEscrow` 退还规则结算。

若玩家 fold：

- AI 胜，`reason = "playerFolded"`。
- 玩家成手在 UI 层不公开（可选），但 domain 内部仍保留 `LockedHand` 用于灾厄判定和弃牌区更新。

若 AI fold：

- 玩家胜，`reason = "aiFolded"`。
- AI 成手同样在 domain 内部保留，用于灾厄和弃牌区。

## Fold 后 Bet 归属

玩家 fold 时，按以下规则分配已下注的 Bet escrow（不依赖牌型比较）：

- **玩家下注额**：归 AI（`aiReceivedBet += playerBet`）。
- **AI 下注额**：退还给 AI（`aiReceivedBet += aiBet`）——AI 自己的钱拿回去，不归玩家。
- 玩家 fold 时玩家没有"赢"任何 Bet，只是 AI 不再拿走自己已投的钱。

例 1：玩家下 5，AI 跟 5，玩家 fold → 玩家 `aiReceivedBet = 5 + 5 = 10`（含自己 5 + 玩家 5），玩家 `playerReceivedBet = 0`。

例 2：玩家下 5，AI raise 到 8，玩家 fold → AI `aiReceivedBet = 5 + 3 = 8`（自己 5 + 玩家 5），玩家 `playerReceivedBet = 0`。

AI fold 时对称：玩家拿回自己 + AI 的下注额。

**注意**：Fold 后灾厄**仍触发**（按双方 `effectiveCards` 重叠判定），但灾厄的"输家"固定为 fold 方（玩家 fold → 输家 = 玩家；AI fold → 输家 = AI）。即使 Bet 总额 = 0 也照常判定，详见灾厄段。

`FoldState` 与 `reason` 一致性：

- `foldState === "playerFolded"` 时 `reason = "playerFolded"`，`winner = "ai"`。
- `foldState === "aiFolded"` 时 `reason = "aiFolded"`，`winner = "player"`。
- `foldState === "none"` 时 `reason ∈ {"handComparison", "exactTie"}`。

## 灾厄判定

只比较双方 `effectiveCards` 的实体牌 ID。表面选中但已失效的用过牌不参与重叠。

触发条件：

- 双方有效牌 ID 集合存在交集（详见 `detectCalamity`）。

Fold 后仍判定灾厄：

- 玩家 fold 时，玩家视为本回合输家。
- AI fold 时，AI 视为本回合输家。
- 灾厄根据双方 `LockedHand.effectiveCards` 的交集判断。
- 灾厄可在 Bet 总额 = 0 时仍触发，此时 `vanishedAir = 0`，但 `triggered = true`、UI 应显示"灾厄触发（无 Air 变化）"。

## 灾厄扣减

如果触发灾厄：

- 正常 Bet 结算照常执行（`settleBetEscrow` 不变）。
- 输家额外扣减自己的下注额（`applyCalamityPenalty`）。
- 额外扣减的 Air 记为 `vanishedAir`，不归属任何一方。
- 若本回合双方下注都为 0，仍记录 `triggered = true`，但 `vanishedAir = 0`、双方 `airDelta` 不变。
- 输家 Air 不足时扣到 0（详见 `applyCalamityPenalty` V1 规则）。

等额下注 5/5 且玩家输：

- 下注时玩家已扣 5，AI 已扣 5。
- 正常结算 AI 获得 10，AI 净赚 5。
- 灾厄额外从玩家 Air 再扣 5。
- 玩家净亏 10，消失 Air 5。
- 账本：`playerAirDelta = -10`、`aiAirDelta = +5`、`vanishedAir = 5`。

## 弃牌区更新

结算后，把双方本回合有效牌加入弃牌区：

- 只加入 `effectiveCards`。
- 用过失效牌不重新进入弃牌区。
- 双方有效牌重叠时，弃牌区只记录一次（`collectDiscardCardIds` 已去重）。
- burnCards 不进入弃牌区。
- 状态机调用顺序：`collectDiscardCardIds` → 生成 `discardCardIds` 记录到 `RoundResolution` → 将双方 `effectiveCards` 传给 `moveEffectiveCardsToDiscard(deckState, effectiveCards)`（见 01 文档）。

## Air 归零检查

结算后任一方 Air 小于等于 0，状态机进入 gameOver。

若双方同时小于等于 0：

1. 比较结算后的 Air。
2. 若仍相同，比较累计赢得底池。
3. 若仍相同，按平局处理或进入总流程定义的决胜判断。

## 测试要求

- 玩家胜时 `aiReceivedBet = playerBet + aiBet`、玩家 `playerReceivedBet = playerBet + aiBet`，净收益等于 `aiBet`。
- AI 胜时对称。
- 完全平手（`reason = "exactTie"`）时双方各拿回自己 ante + 自己 Bet，`vanishedAir = 0`。
- 玩家 fold 时 AI 胜且仍可触发灾厄（`reason = "playerFolded"`）。
- AI fold 时玩家胜且仍可触发灾厄（`reason = "aiFolded"`）。
- 灾厄只比较 `effectiveCards`，不比较失效用过牌。
- 灾厄触发时输家额外扣自己下注额；输家 Air 不足时扣到 0，`vanishedAir` 仍按应有额记录。
- Bet 为 0 时灾厄记录触发（`triggered = true`）但 `vanishedAir = 0`，双方 `airDelta` 不变。
- 0 张 effective 一方与对方永远不触发灾厄（即使对方 0 张也算不触发）。
- 有效牌进入弃牌区，失效牌不进入。
- 重叠有效牌只进入弃牌区一次。
- `LockedHand.selectedCards.length === 5`、`effectiveCards.length ∈ [0, 5]`、`effectiveCards ⊆ selectedCards`（按 `card.id`）。
- `playerEvaluatedHand` / `aiEvaluatedHand` 都基于 `effectiveCards` 计算；不能用 `selectedCards` 直接调 `evaluateHand`。
- Fold 后 Bet 归属：玩家 fold 5/5 → AI `aiReceivedBet = 10`（5+5）、玩家 `playerReceivedBet = 0`；玩家 fold 后 AI 跟注额退还给 AI 自己。

## 实现注意

- 账本函数要返回详细 `airDelta`，便于 UI 展示和测试断言。
- 不要把灾厄扣减写成池子总额乘二。
- 不要用 5 张表面 selectedCards 判定灾厄；必须使用 effectiveCards。

## 完整顺序

建议的结算顺序固定为：

1. `determineRoundWinner`
2. `settleAnte`
3. `settleBetEscrow`
4. `detectCalamity`
5. `applyCalamityPenalty`
6. `collectDiscardCardIds`
7. 汇总 `airDelta`、`vanishedAir` 和 `RoundResolution`

这样可以保证胜负、退还、灾厄和弃牌区更新都从同一份 locked hand 结果出发，方便测试和日志回放。
