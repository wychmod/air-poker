# 08. AIController 实现设计

## 目标

实现稳定、公平、可解释的 V1 规则评分 AI。AI 拆成 LowerAI、UpperAI、BettingAI 三层，由 AIController 串联，但每层输入必须显式，不能偷读玩家隐藏成手。

## 依赖

- `02-number-card-generation.md`
- `03-hand-solver.md`
- `04-hand-evaluator.md`
- `05-betting-engine.md`
- `07-game-state-and-round-flow.md`

## 建议文件

- `src/domain/ai/lower-ai.ts`
- `src/domain/ai/upper-ai.ts`
- `src/domain/ai/betting-ai.ts`
- `src/domain/ai/ai-controller.ts`
- `src/domain/ai/ai-types.ts`
- `src/domain/ai/ai-controller.test.ts`

错误码统一在 `errors.md` §7 维护。

## 公平信息边界

AI 可见：

- 当前回合数（`roundNumber`、`isTiebreaker`）。
- 双方 Air。
- 双方已公开数字牌目标值（`publicTargets`）。
- 当前共享牌库（`drawPile`）。
- 弃牌区（`discardPile`）。
- 自己可组成的所有合法成手。
- 玩家公开目标值下的可能成手集合摘要（`PlayerPossibleHandSummary`，不含实际选择）。
- 当前 Bet 状态。
- AI 历史 all-in 次数与上次 all-in 回合（`aiAllInState`，详见下文）。

AI 不可见：

- 玩家已锁定的隐藏成手（`playerLockedHand`）。
- 玩家内部意图。
- UI 暂定历史中未公开的行为细节（如玩家看过哪些候选组合、停留多久）。
- `settings` 中与牌局无关的字段。
- `roundHistory` 中的细节（仅在结算后作为公开信息可显示）。

类型层面禁止把完整 `GameState` 传给 AI。AI 输入使用专用 DTO（见下文）。

## DTO 与 AI 内部类型

```ts
type LowerAiInput = {
  availableNumberCards: NumberCard[]    // AI 未使用数字牌
  drawPile: Card[]                      // 当前未用共享牌库
  discardPile: Card[]                   // 当前弃牌区
  roundNumber: number
  isTiebreaker: boolean
  aiAir: number
  playerAir: number
  rng: Rng
}

type UpperAiInput = {
  aiTargetValue: number
  candidateHands: SolvedHand[]          // AI 在该 targetValue 下的所有候选成手
  playerPossibleHandSummary: PlayerPossibleHandSummary
  discardPile: Card[]
  rng: Rng
}

type BettingAiInput = {
  aiLockedHand: LockedHand              // AI 自己锁定的成手（不含玩家）
  playerPossibleHandSummary: PlayerPossibleHandSummary
  betState: BetState                    // 05 文档定义
  roundNumber: number
  isTiebreaker: boolean
  aiAir: number
  playerAir: number
  aiAllInState: {                       // AI 私有，不在 GameState 里
    count: number                       // 本局 AI 已 all-in 次数
    lastAllInRound: number | null       // 上次 all-in 的 roundNumber
  }
  legalActions: LegalBetAction[]        // 05 文档 getLegalBetActions 输出
  rng: Rng
}

type AiScore = {
  total: number
  components: Array<{ name: string, impact: number }>  // 评分明细，按 name 索引
}

type ScoreBreakdown<TKey extends string> = {
  byKey: Record<TKey, AiScore>          // 按 numberCardId / handId 索引
  order: TKey[]                         // 评分降序排列的 key 列表
}

type AiReason = {
  primaryAction: string                 // 主动作的简短描述
  topFactors: Array<{ name: string, impact: number }>  // 影响最大的 N 个因素
  summary: string                       // 人类可读总结
}

type LowerAiDecision =
  | { ok: true, selectedNumberCardId: NumberCardId, scoreBreakdown: ScoreBreakdown<NumberCardId>, reason: AiReason, disabledCardReasons: Record<NumberCardId, string> }
  | { ok: false, code: "no-solvable-number-card" }

type UpperAiDecision =
  | { ok: true, lockedHandId: HandId, scoreBreakdown: ScoreBreakdown<HandId>, reason: AiReason }
  | { ok: false, code: "no-upper-hand-candidates" }

type BettingAiDecision =
  | { ok: true, action: BetAction, confidence: number, allInCheck: AllInCheckResult, reason: AiReason, fallbackReason?: string }
  | { ok: false, code: "no-legal-bet-action" }
```

`HandId` = 候选组合 ID，按 `SolvedHand.cards.map(c => c.id).join(",")` 字典序排列（详见 07 文档 `lockPlayerHand` 段）。

## 详细 API 契约

### `chooseLowerNumberCard(input: LowerAiInput): LowerAiDecision`

作用：AI 在下层阶段预选本回合数字牌。

调用时机：**`roundStart -> lowerSelect` 转移时**（在玩家点击之前），由 `round-flow.ts` 同步调用并产生系统 action `aiSelectedNumberCard`。

返回：

- `selectedNumberCardId`: 选中的数字牌 ID。
- `scoreBreakdown.byKey`: 每张候选数字牌的 `AiScore` 明细。
- `scoreBreakdown.order`: 按 `total` 降序排列的数字牌 ID 列表。
- `reason`: 结构化解释（见 `AiReason`）。
- `disabledCardReasons`: 不可解数字牌 → 错误码的映射（`"no-solvable-number-card"` 等）。

失败方式：

- 无可解数字牌时返回 `{ ok: false, code: "no-solvable-number-card" }`，由状态机触发 `replaceUnsolvableNumberCard` 补牌重算。

### `scoreLowerNumberCard(input: ScoreLowerInput): AiScore`

作用：给单张数字牌计算 LowerAI 分数。

参数：

```ts
type ScoreLowerInput = {
  numberCard: NumberCard
  candidateHands: SolvedHand[]          // 该数字牌下的所有候选成手
  roundNumber: number
  aiAir: number
  playerPossibleHandSummary: PlayerPossibleHandSummary
  rng: Rng
}
```

返回 `AiScore`，各 component 名称固定：

- `handCategoryScore`：最强成手牌型分（按 `getHandCategoryBaseScore`，0..1000）。
- `candidateCountScore`：`candidateHands.length * 0.1`，可正可负（0 时为 0）。
- `airPressureAdjustment`：空气压力修正，区间 `[-10, +50]`，分段阈值见 `LowerAI 评分公式` 段。
- `roundAdjustment`：回合阶段修正，区间 `[0, +30]`，R1=0 / R2=5 / R3=10 / R4=20 / R5=30。
- `calamityRiskPenalty`：`risk ∈ [0, 100]`，扣 `risk` 分。
- `futureDeckPenalty`：未来牌库破坏惩罚，扣 `count * 0.5` 分，区间 `[0, 5]`。**既参与总分计算，也在分数并列时作为 tiebreaker**。
- `randomJitter`：均匀随机 `[-3, +3]`。

`total` = 上述 component 之和（`calamityRiskPenalty` 与 `futureDeckPenalty` 为减项，符号按上面规则）。

### `chooseUpperHand(input: UpperAiInput): UpperAiDecision`

作用：AI 根据已公开目标值在候选成手中锁定一组。

调用时机：**`solveHandsSucceeded` 之后、玩家锁定之前**，由 `round-flow.ts` 同步调用并产生系统 action `aiLockedHand`。

返回：

- `lockedHandId`: 锁定的候选组合 ID（`SolvedHand.cards.map(c => c.id).join(",")` 字典序）。
- `scoreBreakdown.byKey`: 每组成手的 `AiScore` 明细。
- `scoreBreakdown.order`: 按 `total` 降序排列的 handId 列表。
- `reason`: 结构化解释。

失败方式：

- 候选成手为空时返回 `{ ok: false, code: "no-upper-hand-candidates" }`，由状态机回退到下层或提前结算。

### `scoreUpperHand(input: ScoreUpperInput): AiScore`

参数：

```ts
type ScoreUpperInput = {
  solvedHand: SolvedHand
  evaluatedHand: EvaluatedHand
  playerPossibleHandSummary: PlayerPossibleHandSummary
  rng: Rng
}
```

返回 `AiScore`，各 component 名称：

- `categoryScore`：牌型基础分（`getHandCategoryBaseScore`）。
- `tiebreakerScore`：同牌型比较分，区间 `[0, 50]`，按当前成手与最强候选的差距归一化。
- `calamityRiskPenalty`：与玩家可能成手的平均重叠估计，扣 `risk` 分（0..100）。
- `futureDeckPenalty`：扣 `count * 0.5` 分（0..5），**既参与总分计算，也作为同分 tiebreaker**。
- `randomJitter`：均匀随机 `[-3, +3]`。

`total` = `categoryScore + tiebreakerScore - calamityRiskPenalty - futureDeckPenalty + randomJitter`。

### `chooseBetAction(input: BettingAiInput): BettingAiDecision`

作用：根据 AI lockedHand、玩家公开目标值可能范围和 BetState 选择下注动作。

调用时机：**每次 `betting` 状态切换到 AI 行动方时**（即玩家提交 Bet 后、AI 收到 action 之前；或 AI raise 后玩家响应之前的初始 AI 决策），由 `round-flow.ts` 同步调用并产生系统 action `aiSubmittedBetAction`。

返回：

- `action`: **已裁剪到合法范围**的 `BetAction`（详见 `chooseBetAction 裁剪规则` 段）。
- `confidence`: clamp 到 `[0, 1]` 的置信度。
- `allInCheck`: All-in 约束检查结果。
- `reason`: 结构化解释。
- `fallbackReason`: 如果从 `allIn` 降级为 `raise` 或更低，写明降级原因。

裁剪规则（V1 钉死）：

1. AI 内部先用置信度决策表（见下文）选定"理想动作"（`allIn / raise X / call / check / fold`）。
2. 把"理想动作"按以下优先级裁剪到 `legalActions`：
   - `allIn`：若 `legalActions` 含 `allIn` 且 `allInCheck.allowed` → 选 `allIn`；否则降级为最大合法 `raise`。
   - `raise X`：把 `X` 截断到 `[minAmount, maxAmount]`，若 `minAmount > maxAmount` 则降级为 `call / check / fold`。
   - `call`：若 `legalActions` 含 `call` 且 `getCallAmount > 0` 且 `aiAir >= getCallAmount` → 选 `call`；否则降级为 `check / fold`。
   - `check`：若 `legalActions` 含 `check` → 选 `check`。
   - `fold`：若 `legalActions` 含 `fold`（即非 `no-fold-without-pressure`）→ 选 `fold`；否则降级为 `check`。
3. 任何降级都要在 `fallbackReason` 写明降级原因。

失败方式：

- `legalActions` 全部 disabled 且无 `check` 可选时返回 `{ ok: false, code: "no-legal-bet-action" }`。
- 该情况理论上不应发生（Bet 状态至少含 `check`），若发生写入 `state.lastError`，由状态机决定后续。

### `calculateBetConfidence(input): ConfidenceResult`

参数：

```ts
type CalculateBetConfidenceInput = {
  aiHandScore: AiScore                  // UpperAI 对 AI lockedHand 的评分
  aiHandPercentile: number              // AI lockedHand.handCategoryBaseScore 在该 targetValue 所有候选成手中的百分位，0..1
  playerStrongHandRisk: number          // 0..1，玩家可能成手中强牌占比（来源：PlayerPossibleHandSummary.strongHandRatio）
  aiAir: number
  playerAir: number
}
```

返回：

```ts
type ConfidenceResult = {
  confidence: number                    // clamp 到 [0, 1]
  components: {
    percentileComponent: number         // percentile * 0.6，区间 [0, 0.6]
    playerRiskComponent: number         // -playerRisk * 0.4，区间 [-0.4, 0]
    airDiffComponent: number            // (airDiff / 25) * 0.2，区间 [-0.2, 0.2]
    airRatioPenalty: number             // -max(0, 0.4 - airRatio) * 0.3，区间 [-0.12, 0]
  }
}
```

公式：

```text
confidence = clamp(
  percentile * 0.6
  - playerRisk * 0.4
  + (airDiff / 25) * 0.2
  - max(0, 0.4 - airRatio) * 0.3,
  0, 1
)
```

`percentile` 含义（V1 钉死）：在该 `targetValue` 候选成手集合中按 `handCategoryBaseScore` 升序排序，AI 锁定的成手排第 `rank` 位（共 `N` 个），`percentile = rank / N`。`rank` 从 0 计（最弱为 0，最强为 N-1）。`playerPossibleHandSummary.bestPossibleCategory` 提供"玩家最强可能牌型"参考。

### `checkAllInAllowed(input): AllInCheckResult`

参数：

```ts
type CheckAllInAllowedInput = {
  confidence: number
  aiAir: number
  roundNumber: number
  isTiebreaker: boolean
  aiAllInState: { count: number, lastAllInRound: number | null }
}
```

返回：

```ts
type AllInCheckResult = {
  allowed: boolean
  failedReasons: Array<"confidence-below-0.92" | "air-below-5" | "round-before-r2-or-tiebreaker" | "all-in-count-exhausted" | "all-in-cooldown">
}
```

V1 钉死的五重约束（详见"All-in 约束"段）。

### `createPlayerPossibleHandSummary(input): PlayerPossibleHandSummary`

作用：把玩家公开目标值下的候选成手转换为 AI 可见摘要。

参数：

```ts
type CreatePlayerPossibleHandSummaryInput = {
  playerTargetValue: number
  playerCandidateHands: SolvedHand[]    // HandSolver upperSelection 模式输出
  aiLockedHand?: LockedHand             // 可选；提供时计算 averageOverlapRiskAgainstAiHand
}
```

返回：

```ts
type PlayerPossibleHandSummary = {
  totalCandidateCount: number
  allUnusedCandidateCount: number
  containsUsedCardCandidateCount: number
  strongHandRatio: number               // 0..1，categoryRank >= 6（Flush 及以上）的占比
  bestPossibleCategory: HandCategory    // 候选成手中 categoryRank 最高的牌型
  averageOverlapRiskAgainstAiHand: number  // 0..1，Jaccard 相似度
  computedAtRound: number               // 计算时的 roundNumber，便于 staleness 检测
}
```

`averageOverlapRiskAgainstAiHand` 计算方式（V1 钉死）：

- 对每组 `playerCandidateHands[i]`，计算 `effectiveCards.map(c => c.id).filter(id => aiLockedHand.effectiveCards.some(c => c.id === id))` 的交集大小 `intersectSize`。
- 每组的重叠 = `intersectSize / 5`。
- 全部候选成手重叠率的平均 = `averageOverlapRiskAgainstAiHand`。
- 若 `playerCandidateHands` 为空，全部为 0。
- 若 `aiLockedHand` 未提供，全部为 0（不计算重叠）。

**安全要求**：

- 不接收玩家实际 `playerLockedHand`。
- 不输出任何"玩家已选中哪一组"的信息。
- `PlayerPossibleHandSummary` 在 `solveHandsSucceeded` 系统 action 时计算一次，写入 `currentRound.playerPossibleHandSummary`；AI 决策时直接读取。
- 若玩家在 `upperSelect` 阶段切换选择（暂定 / 取消暂定），`playerPossibleHandSummary` **不更新**——它只反映玩家在 `publicTargets` 下的所有可能成手，与玩家实际选择无关。这是有意为之的信息隔离：AI 只知道"玩家有哪些选项"，不知道"玩家选了什么"。

## LowerAI

输入：

- AI 剩余数字牌。
- 当前共享牌库。
- 弃牌区。
- 当前 Air。
- 当前回合数。
- 玩家公开前可用的公共信息。
- RNG。

输出：

- 选择的数字牌 ID。
- 每张候选数字牌评分（`scoreBreakdown`）。
- 解释文本（`reason`）和评分明细（`scoreBreakdown.byKey`）。

评分公式（V1 钉死，与 04 文档 `getHandCategoryBaseScore` 对齐）：

```text
total = handCategoryScore                              // 最强成手牌型分，[100, 1000]
      + candidateCountScore                            // candidateHands.length * 0.1
      + airPressureAdjustment                          // [-10, +50]
      + roundAdjustment                                // [0, +30]
      - calamityRiskPenalty                            // [0, 100]
      - futureDeckPenalty                              // [0, 5]
      + randomJitter                                   // [-3, +3]
```

`airPressureAdjustment` 分段（`airRatio = aiAir / 25`）：

- `airRatio >= 0.8`：`-10`。
- `0.5 <= airRatio < 0.8`：`0`。
- `0.3 <= airRatio < 0.5`：`+20`。
- `airRatio < 0.3`：`+50`。

`roundAdjustment` 分段：

- R1：`0`。
- R2：`+5`。
- R3：`+10`。
- R4：`+20`。
- R5（含决胜 R5）：`+30`。

`calamityRiskPenalty` 计算（V1 钉死）：

- 对 AI 候选成手集合中每组成手 `c`，与玩家可能成手摘要的 `PlayerPossibleHandSummary.averageOverlapRiskAgainstAiHand` 关联。
- 单组成手灾厄风险 = `averageOverlapRiskAgainstAiHand * 5 * 20`（5 张 / 5 = 平均每张重叠 1/5，乘 100 标准化为 0..100）。即 `risk = playerPossibleHandSummary.averageOverlapRiskAgainstAiHand * 100`。
- `calamityRiskPenalty = risk`。

`futureDeckPenalty`：

- 数 AI 候选成手 `effectiveCards` 中 K/Q/A/J 数量 `count`。
- `futureDeckPenalty = count * 0.5`，区间 `[0, 5]`。
- **既参与 `total` 计算，也在 `total` 并列时作为次级 tiebreaker**——即 `scoreBreakdown.order` 排序时先按 `total` 降序，`total` 相同时按 `futureDeckPenalty` 升序（破坏小者优先）。

LowerAI 不能等玩家选择后再反选。**调用时机钉死**：`roundStart -> lowerSelect` 转移时由 `round-flow.ts` 同步调用，结果作为系统 action `aiSelectedNumberCard` 推入 reducer，在玩家 `selectNumberCard` 之前已写入 `state.currentRound.publicTargets.aiNumberCardId`。

## UpperAI

输入：

- AI 本回合目标值。
- AI 所有合法候选成手。
- 玩家目标值下的可能成手集合摘要（`PlayerPossibleHandSummary`）。
- 当前弃牌区。
- RNG。

输出：

- AI lockedHand（`lockedHandId`）。
- 候选成手评分列表（`scoreBreakdown`）。
- 解释文本（`reason`）。

评分公式（V1 钉死）：

```text
total = categoryScore                                  // [100, 1000]
      + tiebreakerScore                                // [0, 50]
      - calamityRiskPenalty                            // [0, 100]
      - futureDeckPenalty                              // [0, 5]
      + randomJitter                                   // [-3, +3]
```

`categoryScore` = 04 文档 `getHandCategoryBaseScore`。

`tiebreakerScore` 计算：

- 在该 `targetValue` 所有候选成手中按 `categoryRank + tiebreakers` 排序，找到最强成手 `best`。
- 当前成手与 `best` 的差距归一化：`tiebreakerScore = 50 * (currentRankIndex / bestRankIndex)`，其中 `rankIndex` 是按强到弱排序的索引。
- 若当前成手即最强，`tiebreakerScore = 50`。

`calamityRiskPenalty` = `playerPossibleHandSummary.averageOverlapRiskAgainstAiHand * 100`。

`futureDeckPenalty` = 当前成手 `effectiveCards` 中 K/Q/A/J 数量 `* 0.5`，区间 `[0, 5]`。**既参与 `total` 计算，也在 `total` 并列时作为次级 tiebreaker**（破坏小者优先）。

UpperAI 在 `upperSelect` 阶段内部锁定。**调用时机钉死**：`solveHandsSucceeded` 之后、玩家 `lockPlayerHand` 之前由 `round-flow.ts` 同步调用，结果作为系统 action `aiLockedHand` 推入 reducer。Bet 阶段和摊牌阶段不得重新选择。

## BettingAI

输入：

- AI lockedHand 的评价和评分。
- 玩家公开目标值。
- 玩家可能成手集合摘要（`PlayerPossibleHandSummary`）。
- 双方 Air。
- 当前 BetState。
- 当前回合数与 `isTiebreaker`。
- AI all-in 状态（`aiAllInState`）。
- 当前合法动作列表（`legalActions`，由 BettingEngine 提供）。
- RNG。

输出：

- `BetAction`（已裁剪到合法范围）。
- `confidence`（`[0, 1]`）。
- `allInCheck`（All-in 约束检查结果）。
- `reason`（结构化解释）。
- `fallbackReason`（降级时填）。

置信度公式（V1 钉死，与 04 文档 `calculateBetConfidence` 段一致）：

```text
confidence = clamp(
  percentile * 0.6
  - playerRisk * 0.4
  + (airDiff / 25) * 0.2
  - max(0, 0.4 - airRatio) * 0.3,
  0, 1
)
```

`percentile` = `aiHandPercentile`（见 `calculateBetConfidence` 段）。

`playerRisk` = `PlayerPossibleHandSummary.strongHandRatio`。

`airDiff = aiAir - playerAir`、`airRatio = aiAir / 25`。

**决策表**（V1 钉死，`小注 = call 金额 ≤ 3 Air；大注 = call 金额 > 3 Air`）：

| confidence | 理想动作 | 备注 |
| --- | --- | --- |
| `>= 0.92` 且 All-in 约束通过 | `allIn` | 不通过时降级为 `raise`（不是跳过） |
| `>= 0.85` | `raise`（或 `allIn` 若约束通过） | |
| `0.65 - 0.85` | `call` 或小 `raise`（增量 ≤ 3 Air） | |
| `0.40 - 0.65` | `check` 或 `call` | |
| `0.20 - 0.40` | 小注可 `call`、大注 `fold` | |
| `< 0.20` | `fold` | |

`fold` 仅在场上有下注压力时合法（`legalActions` 不带 `no-fold-without-pressure`）。

裁剪到合法动作详见 `chooseBetAction` 段。**调用时机钉死**：每次 `betting` 状态切换到 AI 行动方时由 `round-flow.ts` 同步调用，结果作为系统 action `aiSubmittedBetAction` 推入 reducer。

## All-in 约束

全部满足才允许 AI all-in（V1 钉死）：

- `confidence >= 0.92`。
- AI 当前 Air `>= 5`。
- 至少 R2（含 R2..R5；R1 不允许；决胜回合 R5 允许）。
- 一局最多 2 次 all-in。
- 上一次 all-in 后至少隔 1 回合（`lastAllInRound === null` 或 `roundNumber - lastAllInRound >= 2`）。

约束失败时：

- 若 `confidence` 仍处于强牌加压区间（`>= 0.85`），降级为最大合法 `raise`，**不**直接跳过下注；`fallbackReason` 填对应失败原因（如 `"air-below-5"`、`"all-in-cooldown"` 等）。
- 若 `confidence < 0.85`，按决策表降级为 `call / check / fold`。
- 降级"从 all-in 降为 raise"是 V1 唯一允许的 all-in 相关降级路径；不允许 all-in 失败后直接变 `check`（避免 AI 行为突兀）。

## 玩家可能成手摘要

为了避免 BettingAI 读取玩家隐藏 hand，输入只传 `PlayerPossibleHandSummary`（详见 `createPlayerPossibleHandSummary` 段）。

该摘要由 `HandSolver`（upperSelection 模式）+ `HandEvaluator` 生成，**不包含玩家实际选择**。计算时机：`solveHandsSucceeded` 系统 action 时计算一次，写入 `currentRound.playerPossibleHandSummary`；玩家切换暂定选择时**不**更新。

## 测试要求

- TypeScript 层面 AI 输入 DTO（`LowerAiInput / UpperAiInput / BettingAiInput`）不包含 `playerLockedHand` 字段；编译期类型断言。
- 运行期测试：使用 `Object.freeze` 冻结输入 DTO，AI 函数访问未声明字段时通过 Proxy 拦截（V1 推荐实现：包一层 `new Proxy(input, { get(target, key) { if (key in target) return target[key]; throw { code: "ai-honest-info-access" }; }) }`）抛出 `ai-honest-info-access`。
- LowerAI 不依赖玩家已选数字牌：在玩家 `selectNumberCard` 之前已 dispatch `aiSelectedNumberCard`。
- UpperAI 锁定后 BettingAI 不会改 hand：`aiLockedHand` 系统 action 写入后，BettingAI 仅通过 `BettingAiInput.aiLockedHand` 读取，不再调用 `chooseUpperHand`。
- BettingAI all-in 满足五重约束：confidence / air / round / count / cooldown 五项依次断言。
- all-in 约束失败时降级 raise：`fallbackReason` 写明降级原因；不允许降级为 `check`。
- 固定 seed 下 AI 决策可复现：seed A-I 的 LowerAI / UpperAI / BettingAI 输出 snapshot 测试。
- AI 输出包含结构化解释：`reason.primaryAction`、`reason.topFactors`、`reason.summary` 全部非空。
- `scoreBreakdown.order` 排序稳定：相同 seed + 相同输入下 byte-equal。
- `PlayerPossibleHandSummary.averageOverlapRiskAgainstAiHand` 计算口径固定：Jaccard 相似度均值，不接收 `playerLockedHand`。
- `LowerAI` 决策时机：`roundStart -> lowerSelect` 转移时由 `round-flow.ts` 同步调用。
- `UpperAI` 决策时机：`solveHandsSucceeded` 之后、玩家锁定之前。
- `BettingAI` 决策时机：每次 AI 行动方轮到自己时。
- `aiAllInState` 不在 GameState：由 `useGameController` 内部维护，跨回合持久化。

## 实现注意

- AI 是纯函数，**不修改任何外部状态**（包括 `GameState` 和 `aiAllInState`）。所有结果通过返回值交给 `round-flow.ts`，由 `round-flow.ts` 派发系统 action 或更新 `useGameController` 内部状态。
- AI 可有随机扰动，但扰动必须来自注入 RNG。AI 内部不持有 `Math.random()`，不调用 `Date.now()`，不调用 `localStorage`。
- AI 不是 UI 助手，不直接返回展示组件（不返回 React JSX、不返回 CSS className）。
- `AIController` 只编排三层 AI，不承担状态机职责。状态机推进由 `07-game-state-and-round-flow.md` 的 reducer 负责。
- 每层 AI 单独接收 `rng`，不持有 `rng` 状态——避免 RNG 状态共享导致不同层 AI 决策序列不可复现。
- AI 解释输出（`reason`）同步显示在调试 UI（`showAIDebug = true`）、Bet 阶段提示框、回合历史中。`reason` 字段不进 localStorage（`settings.md` §3.4）。
