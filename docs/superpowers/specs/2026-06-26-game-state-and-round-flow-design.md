# Air Poker V1 — 06/07 细分实现设计落盘 spec

日期：2026-06-26
来源：
- `doc/v1-implementation-design/06-round-resolution-and-calamity.md`
- `doc/v1-implementation-design/07-game-state-and-round-flow.md`
- `doc/v1-implementation-design/00-index.md`、`errors.md`、`settings.md`

## 1. 范围

- **06（回合结算与灾厄）**：代码已存在于 `src/domain/calamity/calamity-engine.ts` 与 `src/domain/game/round-resolution.ts`，且测试覆盖。本任务**复用**，仅在发现缺口时补齐（默认不动）。
- **07（GameState 与回合状态机）**：尚未实现，是本次主任务。新增文件：
  - `src/domain/game/game-state.ts`
  - `src/domain/game/game-actions.ts`
  - `src/domain/game/game-reducer.ts`
  - `src/domain/game/round-flow.ts`
  - `src/domain/game/game-reducer.test.ts`
  - `src/domain/game/round-flow.test.ts`

## 2. 关键决策（已与用户确认）

1. **AI 编排边界**：07 只做编排框架 + 注入点。`round-flow.ts` 定义 orchestrator 纯函数签名与系统 action 类型；AI 实际决策函数（LowerAI / UpperAI / BettingAI）属于 08，本次不实现。07 测试通过**直接 dispatch 系统动作**驱动状态机；为支持主路径 idle→gameOver 端到端，提供一组**确定性 AI stub**（注入到 `round-flow`），仅用于测试，不放入 `src/domain/ai/`。`useGameController`（10 文档）本次不实现。
2. **决胜回合牌源**（覆盖 07 文档原文）：决胜回合优先使用双方剩余 `available` 且可解数字牌。
   - 一方无可用可解数字牌 → **该方判负**（视为已无牌可打），进入 `gameOver`，`endReason = "earlyTermination"`、`outcome` 按对方胜。
   - 双方都无可用可解数字牌 → **判平局**，进入最终结算，`endReason = "draw"`、`outcome = "tie"`。
   - 不再从 `drawPile` 临时生成数字牌（与用户口径一致；偏离 07 文档「临时生成」段，需回写文档说明）。
3. **文档回写**：在 07 文档「决胜回合」段补一句注记，说明 V1 实际口径为「无可用数字牌即判负/平局，不临时生成」。

## 3. 数据模型（07 核心）

### 3.1 GamePhase

```
idle | initializing | roundStart | lowerSelect | solveHands
| upperSelect | betting | showdown | resolve
| roundSummary | gameOver
```

### 3.2 GameState

```ts
type GameState = {
  version: 1
  seed: string
  phase: GamePhase
  roundNumber: number          // 1..5；决胜保持 5
  isTiebreaker: boolean
  playerAir: number
  aiAir: number
  deckState: DeckState
  numberCards: { player: NumberCard[]; ai: NumberCard[] }
  currentRound: CurrentRound   // discriminated union（按阶段字段矩阵）
  roundHistory: RoundHistoryEntry[]
  settingsSnapshot: Settings
  lastError: ErrorPayload | null
  // 累计赢得底池（净赢得 Bet），用于 R5 平手决胜
  playerPool: number
  aiPool: number
}
```

### 3.3 CurrentRound 阶段字段矩阵（discriminated union）

每个阶段用一个 `phase` 字面量 + 必填字段构成联合分支；跨阶段读取不存在字段在 TS 层报错。

| phase | 必须字段 |
| --- | --- |
| `roundStart` | `roundCosts` |
| `lowerSelect` | `publicTargets`, `numberCardCost`, `ante` |
| `solveHands` | `publicTargets`, `playerPossibleHandSummary` |
| `upperSelect` | `publicTargets`, `playerCandidateHands`, `playerPossibleHandSummary`, `aiLockedHand?` |
| `betting` | `publicTargets`, `playerLockedHand`, `aiLockedHand`, `betState` |
| `showdown` | `publicTargets`, `playerLockedHand`, `aiLockedHand`, `showdown` |
| `resolve` | `publicTargets`, `playerLockedHand`, `aiLockedHand`, `resolution` |
| `roundSummary` | `publicTargets`, `playerLockedHand`, `aiLockedHand`, `resolution` |
| `gameOver` | `finalResult` |

`idle` / `initializing` 阶段 `currentRound = null`（用专门分支表达）。

### 3.4 RoundHistoryEntry

按 07 文档定义，含 `roundNumber`、`isTiebreaker`、双方数字牌 ID/目标值、双方 `LockedHand`、`betActions`、`foldState`、`resolution`。

### 3.5 finalResult

复用 `LastResultSummary`（settings.ts）作为 `gameOver.finalResult`，由 `finishGame` 填充：
- `outcome`：`playerWin` / `aiWin` / `tie`
- `endReason`：`airDepleted` / `fiveRounds` / `tiebreaker` / `earlyTermination` / `draw`
- `playerPool` / `aiPool`：累计赢得底池（来自 `resolution.escrowDistribution.playerReceivedBet - escrow.playerBet` 之和）
- `calamityCount`、`playerAllInCount`、`aiAllInCount`：从 `roundHistory` 聚合
- `timestamp`：由调用方（app 层）在 `finishGame` 时注入，domain 不调用 `Date.now`

## 4. GameAction 设计

### 4.1 用户动作（discriminated union）

`startNewGame`、`selectNumberCard`、`lockPlayerHand`、`autoLockRecommendedHand`、`enterBetting`、`submitBetAction`、`confirmDangerousAction`、`continueToNextRound`、`restartGame`、`updateSettings`。

> `openPanel` / `closePanel` 不进 reducer（07 文档钉死：panels 由 `useGameController` useState 维护），故不在 action union 中。

### 4.2 系统动作

`initializationSucceeded`、`initializationFailed`、`applyRoundCosts`、`aiSelectedNumberCard`、`solveHandsSucceeded`、`solveHandsFailed`、`aiLockedHand`、`aiSubmittedBetAction`、`betClosed`、`showdown`、`resolveRound`、`finishGame`。

### 4.3 reducer 契约

- 纯函数，不读时间/随机/localStorage，不调用 AI。
- 非法 action 写 `lastError`，**不抛异常**。
- 错误阶段 → `lastError.code = "wrong-phase"`。
- 失败码：`invalid-hand-selection`、`missing-ai-locked-hand`、`cannotPayBreathingCost`、`cannotPayAnte`、`missing-locked-hand`、`invalid-escrow` 等，统一引用 `errors.md`。

## 5. 阶段流转函数（reducer 内部 helper）

按 07 文档「详细 API 契约」实现：

- `createIdleState()`、`initializeNewGame()`
- `applyRoundCosts()`：先扣呼吸 1，再扣参加费 R（决胜 R=5）；不足写 `cannotPayBreathingCost` / `cannotPayAnte`，呼吸不回滚。
- `selectPlayerNumberCard()`：标记玩家数字牌 used + 写 player 目标值；AI 目标值由 `aiSelectedNumberCard` 系统动作预先写入。
- `solveCurrentRoundHands()`：用 `solveHands` + `rankSolvedHands` 枚举玩家候选、生成 `playerPossibleHandSummary`。
- `lockPlayerHand(handId)`：`handId` = 候选 effectiveCards id join，校验存在性。
- `enterBetting()`：未锁定则自动锁定最强成手（`autoLocked = true`）；校验 `aiLockedHand`；`createInitialBetState` 进入 `betting`。
- `submitBetAction()`：调 `applyBetAction`，收敛则写 `betClosed` 标记交由 `betClosed` 转入 `showdown`。
- `betClosed()`：`betting` → `showdown`，写入 `foldState`（fold 动作即玩家/AI fold）。
- `showdownCurrentRound()`：写公开成手/牌型/重叠 → `resolve`。
- `resolveCurrentRound()`：调 `resolveRound`，更新 Air/弃牌区/累计底池/`roundHistory`，进入 `roundSummary` 或 `gameOver`（Air 归零）。
- `continueToNextRound()`：按 R5 + Air + 累计底池 + 决胜判定。
- `finishGame(outcome, endReason)`：填 `finalResult` → `gameOver`。

### 5.1 弃牌区更新

`resolveCurrentRound` 拿 `resolution.discardCardIds` → 调 `moveEffectiveCardsToDiscard(deckState, cards)`（注意现有签名接收 `Card[]`，需按 id 从 deckState 取出对应 Card 实体后传入）。

### 5.2 累计底池

`playerPool += resolution.escrowDistribution.playerReceivedBet - escrow.playerBet`；AI 对称。Air 归零用结算后 Air 判定。

## 6. round-flow.ts 编排层

- 纯函数 `orchestrator`：接收 `GameState` + AI 决策函数注入对象（`{ chooseLowerNumberCard, chooseUpperHand, chooseBetAction }`，均可为 null/stub），返回**待 dispatch 的系统 action 列表**（不直接改 state）。
- 时机（07 文档）：
  - `roundStart → lowerSelect`：调 `chooseLowerNumberCard` 产 `aiSelectedNumberCard`。
  - `upperSelect`：调 `chooseUpperHand` 产 `aiLockedHand`（在玩家 enterBetting 前注入）。
  - `betting`：调 `chooseBetAction` 产 `aiSubmittedBetAction`。
- **本次只实现框架 + 确定性 stub**（注入点），不实现真实 AI 评分（08）。
- 时间不进 GameState；`turnStartedAt` 由 reducer 用注入的 `now()` 写入（`applyBetAction` 已支持 `options.now`）。

## 7. 测试要求（07）

按 07 文档「测试要求」+ harness 4.3 seed A-J：

- 主路径 idle→gameOver（用确定性 AI stub 跑通，覆盖 seed A 主路径）。
- R5 后按 Air 判胜负；Air 相同按 `playerPool`/`aiPool`；仍相同进一次决胜（`isTiebreaker=true`、`roundNumber=5`）；决胜仍平判 `draw`。
- 无法支付呼吸成本 → `cannotPayBreathingCost`，`roundNumber` 不递增。
- 无法支付参加费 → `cannotPayAnte`，呼吸不回滚。
- 双方同时不足参加费 → 双方 Air 归零进 `gameOver`。
- 进入 Bet 前未锁定 → 自动锁定（`autoLocked=true`）。
- AI 未锁定 → `enterBetting` 写 `missing-ai-locked-hand`，不推进。
- Bet 阶段 `lockPlayerHand` → `wrong-phase`。
- AI 数字牌在玩家 `selectNumberCard` 前已写入 `publicTargets`。
- 决胜回合费用按 R5=5。
- `restartGame` 强制新 seed（domain 内接受新 seed 参数；app 层生成新 seed，08/09）。
- `updateSettings` 不改 `phase`。
- reducer 对错误阶段 action 写 `wrong-phase` 不抛异常。
- 决胜回合无可用可解数字牌：一方无→该方负；双方无→平局。
- 灾厄触发时输家净亏 = 池子总额（不 ×2，由 06 保证，07 集成测试断言）。

## 8. 实现注意

- reducer 纯函数；AI 经系统 action 注入，UI 不直接调 AI。
- `currentRound` 用 discriminated union，跨阶段读字段 TS 编译失败。
- 不在 domain 调 `Date.now` / `Math.random` / `localStorage`；时间经注入 `now()`，seed/RNG 由 app 层创建后传入 `initializeNewGame`。
- 调试日志由 app/controller 层记录（domain 返回 event/reason）；本次 07 domain 模块不直接 import `debug-log`。

## 9. 验证

- `npm run test`（先跑 07 新测试文件，再全量）。
- `npm run verify`（format:check + typecheck + lint + test + build）。
- 不涉及 UI 主流程，`npm run verify:full` 非必需（无 e2e）。

## 10. 剩余风险

- 真实 AI（08）未实现，端到端只能用确定性 stub，真实策略下 seed A-J 的具体局面可能与 harness 预期场景不完全一致（如 seed B 的灾厄触发依赖 AI 决策），这部分留待 08。
- `useGameController`、UI、超时倒计时未实现（10/11），30 秒超时逻辑仅 BettingEngine 层提供 `getTimeoutBetAction`，编排由后续补。
- 决胜回合「无牌即判负/平局」偏离 07 文档「临时生成」段，需回写文档。
