# 07. GameState 与回合状态机实现设计

## 目标

用显式 `GameState` 和 `GameAction` 管理整局流程，保证 UI 不能直接修改复杂状态，AI 和系统自动动作也通过同一 reducer 推进。

## 依赖

- `01-cards-rng-and-deck.md`
- `02-number-card-generation.md`
- `03-hand-solver.md`
- `04-hand-evaluator.md`
- `05-betting-engine.md`
- `06-round-resolution-and-calamity.md`

## 建议文件

- `src/domain/game/game-state.ts`
- `src/domain/game/game-actions.ts`
- `src/domain/game/game-reducer.ts`
- `src/domain/game/round-flow.ts`
- `src/domain/game/game-reducer.test.ts`
- `src/domain/game/round-flow.test.ts`

错误码统一在 `errors.md` §8 维护。

## 阶段

```text
idle
initializing
roundStart
lowerSelect
solveHands
upperSelect
betting
showdown
resolve
roundSummary
gameOver
```

使用 discriminated union 表达阶段数据，避免在错误阶段读取不存在字段。
`GameState.phase` 与 `currentRound.phase` 必须始终一致，由 reducer 统一维护。

### 阶段字段矩阵（V1 钉死）

下表列出每个阶段 `currentRound` 必须存在的字段（其他字段视为不存在）：

| 阶段 | 必须存在的 `currentRound` 字段 | 备注 |
| --- | --- | --- |
| `roundStart` | `roundCosts` | 扣完呼吸 + 参加费后立即进入 `lowerSelect` |
| `lowerSelect` | `publicTargets`, `numberCardCost`, `ante` | 玩家选数字牌；AI 数字牌由系统 action `aiSelectedNumberCard` 注入（见下文 AI 时序） |
| `solveHands` | `publicTargets`, `playerPossibleHandSummary` | 系统枚举双方成手后进入 `upperSelect` |
| `upperSelect` | `publicTargets`, `playerCandidateHands`, `playerPossibleHandSummary`, `playerLockedHand`, `autoLocked`, `aiLockedHand` | 玩家锁定成手；AI 锁定成手由系统 action `aiLockedHand` 注入 |
| `betting` | `publicTargets`, `playerLockedHand`, `aiLockedHand`, `betState`, `betActions`, `foldState`, `autoLocked`, `ante` | 进入 Bet 后两者均不可改 |
| `showdown` | `publicTargets`, `playerLockedHand`, `aiLockedHand`, `showdown`, `foldState`, `ante`, `betState`, `betActions` | 公开双方成手 + 牌型 + 重叠 |
| `resolve` | `publicTargets`, `playerLockedHand`, `aiLockedHand`, `resolution`, `foldState`, `ante`, `betState`, `betActions` | 结算 |
| `roundSummary` | `publicTargets`, `playerLockedHand`, `aiLockedHand`, `resolution`, `foldState`, `ante`, `betState`, `betActions` | 等待用户继续 |
| `gameOver` | `finalResult` | 见 `LastResultSummary`（`settings.md` §2） |

## 核心状态

```ts
type GamePhase =
  | "idle" | "initializing" | "roundStart" | "lowerSelect" | "solveHands"
  | "upperSelect" | "betting" | "showdown" | "resolve"
  | "roundSummary" | "gameOver"

type RoundCosts = {
  breathing: number
  playerAnte: number
  aiAnte: number
}

type Ante = {
  playerAnte: number
  aiAnte: number
}

type PublicTargets = {
  playerNumberCardId: NumberCardId | null
  aiNumberCardId: NumberCardId | null
  playerTargetValue: number | null
  aiTargetValue: number | null
}

type ShowdownView = {
  playerLockedHand: LockedHand
  aiLockedHand: LockedHand
  overlappingCardIds: CardId[]
}

type CurrentRound =
  | { phase: "idle" }
  | { phase: "initializing" }
  | { phase: "roundStart"; roundCosts: RoundCosts }
  | { phase: "lowerSelect"; publicTargets: PublicTargets; numberCardCost: number; ante: Ante }
  | { phase: "solveHands"; publicTargets: PublicTargets; playerPossibleHandSummary: SolvedHandSummary }
  | {
      phase: "upperSelect"
      publicTargets: PublicTargets
      playerCandidateHands: RankedSolvedHand[]
      playerPossibleHandSummary: SolvedHandSummary
      playerLockedHand: LockedHand | null
      autoLocked: boolean
      aiLockedHand: LockedHand | null
    }
  | {
      phase: "betting"
      publicTargets: PublicTargets
      playerLockedHand: LockedHand
      aiLockedHand: LockedHand
      betState: BetState
      betActions: BetAction[]
      foldState: FoldState
      autoLocked: boolean
      ante: Ante
    }
  | {
      phase: "showdown"
      publicTargets: PublicTargets
      playerLockedHand: LockedHand
      aiLockedHand: LockedHand
      showdown: ShowdownView
      foldState: FoldState
      ante: Ante
      betState: BetState
      betActions: BetAction[]
    }
  | {
      phase: "resolve"
      publicTargets: PublicTargets
      playerLockedHand: LockedHand
      aiLockedHand: LockedHand
      resolution: RoundResolution
      foldState: FoldState
      ante: Ante
      betState: BetState
      betActions: BetAction[]
    }
  | {
      phase: "roundSummary"
      publicTargets: PublicTargets
      playerLockedHand: LockedHand
      aiLockedHand: LockedHand
      resolution: RoundResolution
      foldState: FoldState
      ante: Ante
      betState: BetState
      betActions: BetAction[]
    }
  | { phase: "gameOver"; finalResult: LastResultSummary }

type GameState = {
  version: 1
  seed: string                          // 写入 GameState 供调试复现
  phase: GamePhase
  roundNumber: number                   // 1..5，决胜回合固定为 5
  isTiebreaker: boolean                 // 决胜回合标志
  playerAir: number                     // 双方当前 Air
  aiAir: number
  deckState: DeckState                  // 01 文档定义
  numberCards: {
    player: NumberCard[]                // 长度 0..5（按 status 过滤后）
    ai: NumberCard[]
  }
  currentRound: CurrentRound            // discriminated union（见上表）
  roundHistory: RoundHistoryEntry[]     // 每回合结算后追加一条
  settingsSnapshot: Settings            // settings.md §1 定义
  lastError: ErrorPayload | null        // errors.md §11 定义
  playerPool: number                    // 本局累计净赢得底池（不含参加费）
  aiPool: number
}

type ErrorPayload = {
  code: string
  message: string
  phase?: GamePhase
  details?: unknown
}
```

> `numberCards` 字段按 owner 拆成 `player / ai` 两个独立数组。开局时各 5 张；用过的牌仍在数组里但 `status` 不为 `available`；补牌重算时被替换的牌 `status = "replaced"`，按上文规则从数组移除（见 02 文档）。

### RoundHistoryEntry 结构

```ts
type RoundHistoryEntry = {
  roundNumber: number                     // 常规 R1-R5；决胜回合固定为 5（见决胜回合段）
  isTiebreaker: boolean                   // true 表示该条目为决胜回合，与上一条 roundNumber=5 区分
  playerNumberCardId: NumberCardId
  aiNumberCardId: NumberCardId
  playerTargetValue: number
  aiTargetValue: number
  playerHand: LockedHand                // 06 文档定义
  aiHand: LockedHand
  betActions: BetAction[]               // 双方本回合所有 Bet 动作
  foldState: FoldState                  // 06 文档定义
  resolution: RoundResolution           // 06 文档定义
  escrow: RoundEscrow                   // 06 文档定义
}
```

UI 展示约定：结算页 `roundHistory` 出现两条 `roundNumber = 5` 时，必须用 `isTiebreaker` 标识第二条为决胜回合，避免误显示为重复 R5。

仅在 `resolveCurrentRound` 完成后追加；`roundHistory` 在 `GameState` 全程保留（不进入 localStorage，详见 `settings.md` §3.4）。

## 详细 API 契约

### `createIdleState(): GameState`

作用：创建应用初始空闲状态。

参数：无。

返回：

- `phase = "idle"`。
- 无当前牌局。
- 可包含已读取的设置和最近一局摘要引用。

### `initializeNewGame(input): InitializeGameResult`

作用：创建新局完整初始状态。

参数：

- `seed`: 新局 seed。
- `rng`: seed 对应 RNG。
- `settingsSnapshot`: 当前设置快照。

返回：

- 成功：`{ ok: true, state }`，进入 `roundStart`。
- 失败：`{ ok: false, reason, details }`。

失败原因：

- `number-card-generation-failed`
- `invalid-seed`
- `initial-hand-unsolvable`

调用方：

- `startNewGame` action。

### `gameReducer(state, action): GameState`

作用：唯一状态变更入口。

参数：

- `state`: 当前 GameState。
- `action`: 用户、AI 或系统 action。

返回：

- 新 GameState。
- 对非法 action，返回带 `lastError` 的状态或保持原状态并记录错误，不能抛出导致 UI 崩溃的异常。

要求：

- 纯函数。
- 不读取时间、随机数、localStorage。
- 不直接调用 AI；AI 输出通过 action 传入。
- reducer 不负责 AI 调度；`round-flow.ts` 先规划 action，再由 reducer 消费。
- reducer 只做状态推进，不负责调度 AI；AI 调度由 `round-flow.ts` 负责。

### `applyRoundCosts(state): GameState`

作用：回合开始时扣呼吸成本和参加费。

参数：

- phase 必须是 `roundStart`。

返回：

- 成功：记录双方呼吸成本、参加费 escrow，进入 `lowerSelect`。
- 失败：进入 `gameOver`，结束原因是 `cannotPayBreathingCost` 或 `cannotPayAnte`。

**扣费顺序（V1 钉死）**：

1. 先扣呼吸成本：双方各扣 1 Air。
   - 双方都足够：进入步骤 2。
   - 某方不足 1：写入 `lastError.code = "cannotPayBreathingCost"`，进入 `gameOver`，`roundNumber` 不递增，**不**进入下一回合。**不足方 Air 归零，够方不扣这 1 点呼吸**（按「某方不足即结束」语义，不连累够的一方）。
2. 再扣参加费：双方各扣 `R` Air（`R = roundNumber`；决胜回合 `R = 5`）。
   - 双方都足够：进入 `lowerSelect`，并写入 `currentRound.ante = { playerAnte: R, aiAnte: R }` 与 `currentRound.numberCardCost`。
   - 某方不足 R：写入 `lastError.code = "cannotPayAnte"`，进入 `gameOver`。**呼吸扣减不回滚**（按原作口径"先扣后判"），不足方 Air 归零（参加费按应有额扣但 Air 不为负），够方正常扣呼吸 + 参加费。
   - 双方同时不足：写入 `cannotPayAnte`，按"双方 Air 归零"进入 `gameOver` 决胜/平局判断（详见下文 Air 归零段）。

`numberCardCost` 字段记录本回合参加费（`R`），用于结算时退还。

### `selectPlayerNumberCard(state, numberCardId): GameState`

作用：处理玩家下层选择。

参数：

- 当前必须是 `lowerSelect`。
- `numberCardId`: 玩家可用且可解数字牌 ID。

返回：

- 标记玩家数字牌已使用。
- 写入玩家公开目标值。
- 若 AI 已预选，写入 AI 公开目标值。
- 进入 `solveHands`。

失败方式：

- 数字牌不存在、已使用或不可解时，保持阶段并写入 `lastError`。
- AI 尚未预选数字牌（`publicTargets.aiNumberCardId === null`）时玩家选牌，写入 `lastError.code = "missing-ai-number-card"`，保持阶段不推进。

**AI 数字牌预选与公开时序（V1 钉死）**：

- AI **不能等玩家选择后再反选**。LowerAI 决策在 `roundStart -> lowerSelect` 转移时由 `round-flow.ts` 调用并产生系统 action `aiSelectedNumberCard`；该 action 在玩家 `selectNumberCard` 之前已 dispatch 到 reducer，`state.currentRound.publicTargets.aiNumberCardId` 已写入。
- 玩家 `selectNumberCard` 时 reducer 同时写入 `publicTargets.playerNumberCardId`；`publicTargets` 双方都齐了之后才进入 `solveHands`。
- UI 必须在玩家点击时同时展示 AI 已选数字牌（不能等玩家选完再"想"），与 user-flow 8.x 一致。
- 玩家剩余数字牌全部不可解时，状态机先调用 `02-number-card-generation.md` 的 `replaceUnsolvableNumberCard`；失败才回退到错误处理（`not-enough-cards` / `no-legal-replacement-hand` / `replacement-still-unsolvable`）。

### `solveCurrentRoundHands(state): GameState`

作用：为双方公开目标值枚举合法成手。

参数：

- 当前必须是 `solveHands`。

返回：

- 双方都有候选：进入 `upperSelect`。
- 玩家无候选：回退 `lowerSelect` 或进入提前结算，按错误原因决定。
- AI 无候选：触发 AI 补牌或提前结算。
- 这一阶段在代码里对应 `solveHandsSucceeded` 系统动作；`round-flow.ts` 先调用 `enumeratePlayerCandidateHands` 再 dispatch。

### `lockPlayerHand(state, handId): GameState`

作用：把玩家候选组合锁定为本回合隐藏成手。

参数：

- 当前必须是 `upperSelect`。
- `handId`: 候选组合 ID。**V1 固定格式**：`SolvedHand.cards.map(c => c.id).join(",")`，按稳定字典序排列（见 03 文档附录 B）。例：`C-2,C-5,D-7,H-9,S-K`。

返回：

- 写入 `currentRound.playerLockedHand`。
- 保持在 `upperSelect`，等待玩家点 `enterBetting`。

失败方式：

- 组合不存在时写入 `lastError.code = "invalid-hand-selection"`，状态不推进。
- 玩家已锁定后再调用：忽略（`playerLockedHand` 已被冻结，进入 Bet 后由 `wrong-phase` 拦截）。

### `enterBetting(state): GameState`

作用：从上层阶段进入 Bet。

参数：

- 当前必须是 `upperSelect`。

返回：

- 若玩家已有 `playerLockedHand`，冻结该 hand。
- 若玩家没有 `playerLockedHand`，自动调用推荐策略锁定一组（按 `04-hand-evaluator.md` 的 `rankSolvedHands` 取最强），并记录 `currentRound.autoLocked = true`。**V1 钉死**：进入 Bet 前必须自动锁定，玩家不能跳过；UI 必须展示"已自动锁定推荐成手"提示。
- 校验 `aiLockedHand` 必须存在；缺失时 `lastError.code = "missing-ai-locked-hand"`，状态不推进。
- 创建 `BetState`（`05-betting-engine.md` 定义），进入 `betting`。
- `turnStartedAt` 在进入 `betting` 时写入当前时间，用于 30 秒倒计时。

失败方式：

- 无玩家候选成手时进入异常恢复或提前结算。
- AI 未锁定成手时写入 `missing-ai-locked-hand`。

### `submitBetAction(state, action): GameState`

作用：执行玩家或 AI 的下注动作。

参数：

- 当前必须是 `betting`。
- `action`: 已提交 BetAction。

返回：

- Bet 未结束：保持 `betting`，更新 BetState。
- Bet 结束后由编排层/调用方派发系统 action `betClosed`，再由 `betClosed` 将 state 转入 `showdown`。Bet 是否结束由 BettingEngine 按多轮收敛判定（任一方 `check / call / fold / all-in 响应` 即收敛，详见 `05-betting-engine.md`）。`submitBetAction` 不直接跳 `showdown`，统一经 `betClosed` 转移，保证收敛判定与阶段转移解耦。
- 代码实现里 `betClosed`、`showdown`、`resolveRound` 都是显式系统 action，不靠 reducer 隐式跳转。

失败方式：

- 非法下注动作写入 `lastError`，状态不推进。

### `showdownCurrentRound(state): GameState`

作用：公开双方 lockedHand 并计算牌型展示数据。

参数：

- 当前必须是 `showdown`。

返回：

- 写入双方公开成手、牌型、重叠提示。
- 进入 `resolve`。
- 代码里对应 `showdown` 系统 action，`showdownCurrentRound` 仅是文档化命名。

### `resolveCurrentRound(state): GameState`

作用：执行完整回合结算。

参数：

- 当前必须是 `resolve`。

返回：

- 写入 resolution。
- 更新 Air、弃牌区、累计赢得底池、回合历史。
- 根据胜负条件进入 `roundSummary` 或 `gameOver`。
- 代码里对应 `resolveRound` 系统 action；`playerPool` / `aiPool` 在这里累加。

### `continueToNextRound(state): GameState`

作用：从回合摘要进入下一回合。

参数：

- 当前必须是 `roundSummary`。

返回：

- 若 `roundNumber < 5` 且牌库支持：`roundNumber += 1`（不修改 `isTiebreaker`），进入下一轮 `roundStart`。
- 若 `roundNumber === 5` 且双方 Air 分出胜负：进入 `gameOver`，`finalResult` 按"Air 决胜"填。
- 若 `roundNumber === 5` 且双方 Air 相同：
  - 比 `roundHistory` 累计 `playerPool` vs `aiPool`（净赢得底池累计值），分出胜负则进入 `gameOver`。
  - 仍相同：`isTiebreaker = true`、`roundNumber = 5`（**决胜回合 roundNumber 保持 5，按 R5 计费**），进入决胜 `roundStart`。
- 决胜回合结束后仍相同：进入 `gameOver`，`endReason = "draw"`，`outcome = "tie"`。
- 牌库或数字牌不支持继续（详见"提前结束"段）：进入提前结算路径。
- `restartGame` action 由用户在结算页触发，详见 `restartGame` 段。

## 进入 Bet 的口径固定

源文档中“未暂定也可进入 Bet”和“下注开始后暂定冻结”存在张力。V1 实现固定为：

- 进入 Bet 前必须有 `playerLockedHand`。
- 如果玩家没有手动暂定，点击 `进入 Bet` 时系统自动调用推荐策略锁定一组。
- UI 必须提示“已自动锁定推荐成手”。
- Bet 开始后不允许更换成手。
- `autoLocked` 仅表示系统是否替玩家自动锁定，不影响 AI 锁定状态。

这样保证下注阶段信息边界清晰，摊牌时不会根据下注行为再改选。

## Action 设计

### 用户动作

- `startNewGame(seed?)`：UI 命令；seed 可选，不传则由 `app-service` 的 `createRuntimeSeed` 生成。底层 reducer action 会由 app 层补齐 `seed / rng / deckState / numberCards / settingsSnapshot`。
- `selectNumberCard(numberCardId)`：玩家下层选择。
- `lockPlayerHand(handId)`：玩家上层锁定。
- `autoLockRecommendedHand()`：玩家主动点"使用推荐成手"。
- `enterBetting()`：玩家点"进入下注"。
- `submitBetAction(action)`：玩家 Bet 动作。
- `confirmDangerousAction(actionId, confirmed: boolean)`：对 fold / allIn / restartGame 的二次确认。
- `continueToNextRound()`：从 roundSummary 进入下一回合或 gameOver。
- `restartGame()`：从 gameOver / 任意阶段"放弃当前牌局"。**V1 钉死语义**：必须传入新 seed（默认调 `createRuntimeSeed`）；不复用当前 seed。底层 reducer action 同样由 app 层补齐 `seed / rng / deckState / numberCards / settingsSnapshot`。`restartGame` 写入 `lastError` 提示用户"已放弃当前牌局，开始新局"。
- `updateSettings(patch)`：更新设置。

`openPanel / closePanel` 是 `useGameController` 的 UI 命令，不进入 `GameAction`；`updateSettings` 会进入 reducer。

### 系统动作

- `initializationSucceeded`：初始化成功，state 进入 `roundStart`。
- `initializationFailed`：初始化失败，state 进入 `gameOver`，`lastError.code = "initial-hand-unsolvable"` 等。
- `applyRoundCosts`：回合开始扣费，state 进入 `lowerSelect`（或失败 gameOver）。
- `aiSelectedNumberCard(numberCardId)`：LowerAI 决策结果。
- `solveHandsSucceeded(playerSummary, aiCandidates)`：枚举成功，state 进入 `upperSelect`。
- `solveHandsFailed`：枚举失败，触发补牌重算或提前结算。
- `aiLockedHand(handId)`：UpperAI 决策结果。
- `aiSubmittedBetAction(action)`：BettingAI 决策结果。
- `betClosed`：Bet 收敛，state 进入 `showdown`。
- `showdown`：双方摊牌，state 进入 `resolve`。
- `resolveRound`：完成结算，state 进入 `roundSummary`。
- `finishGame(outcome, endReason)`：进入 `gameOver`。

### AI 决策的同步/异步（V1 钉死）

- AI 是**纯函数同步返回** `aiSelectedNumberCard / aiLockedHand / aiSubmittedBetAction` 等 action。
- `round-flow.ts` 负责在适当时机调用 AI 函数（见 `08-ai-controller.md` 时机段），把结果作为系统 action 推入 reducer。
- `useGameController` 不直接调用 AI；通过 `round-flow.ts` 编排。
- 玩家点击等待 AI 决策时，UI 用 `useGameController` 的 `isAiThinking: boolean` 状态（不进入 GameState）展示 loading。AI 决策同步完成的情况下 `isAiThinking` 仅持续一个微任务（`Promise.resolve().then` 模拟异步），UX 上避免主线程卡顿。
- `round-flow.ts` 只规划四类 AI 系统 action：`aiSelectedNumberCard`、`solveHandsSucceeded`、`aiLockedHand`、`aiSubmittedBetAction`。

## 主路径

1. `idle -> initializing`
2. 初始化牌库、数字牌、Air、seed。
3. `initializing -> roundStart`
4. 扣呼吸成本和参加费。
5. 若扣费失败，进入 `gameOver`。
6. `roundStart -> lowerSelect`
7. 玩家选数字牌，AI 同步公开预选数字牌。
8. `lowerSelect -> solveHands`
9. 枚举双方成手。
10. `solveHands -> upperSelect`
11. 玩家锁定成手，AI 内部锁定成手。
12. `upperSelect -> betting`
13. 玩家与 AI 多轮下注，raise 计数收敛后进入摊牌（详见 `05-betting-engine.md`）。
14. `betting -> showdown`
15. 双方同时摊牌。
16. `showdown -> resolve`
17. 牌型、Bet、灾厄、弃牌区结算。
18. `resolve -> roundSummary`
19. 用户继续下一回合或进入 `gameOver`。

## 提前结束

以下情况进入提前结算：

- 初始化无法生成有效数字牌。
- 回合开始无法支付呼吸成本。
- 回合开始无法支付参加费。
- 下层阶段补牌重算失败。
- 成手枚举阶段双方或一方无合法成手且无法恢复。
- 当前共享牌库不足以支持下一回合。
- 决胜回合中某方无可用可解数字牌。

提前结算顺序：

1. 比较当前 Air。
2. Air 高者胜。
3. Air 相同，比较累计赢得底池。
4. 仍相同且牌库支持，进入一次决胜回合。
5. 仍无法决胜，判平局。

## 决胜回合

完成 R5 后仍平局时，最多进入一次额外决胜回合：

- `isTiebreaker = true`、`roundNumber = 5`（保持 5，便于 `applyRoundCosts` 按 R5 = 5 收费）。
- 决胜回合费用按 R5 口径处理：呼吸 1 Air + 参加费 5 Air。
- 若双方仍有 `status === "available"` 的可解数字牌，继续使用（不再生成新数字牌）。
- **V1 实际口径（2026-06-26 落盘修订）**：若某方无可用可解数字牌，**该方判负**（视为已无牌可打），进入 `gameOver`，`endReason = "earlyTermination"`、`outcome` 按对方胜；双方都无可用可解数字牌则判平局，`endReason = "draw"`、`outcome = "tie"`。**不再从 `drawPile` 临时生成数字牌**。
- 决胜后仍平局：直接判平局，`phase = "gameOver"`、`finalResult.outcome = "tie"`、`endReason = "draw"`。
- **不允许无限追加决胜**——V1 只允许一次决胜。
- 决胜回合仍由 `roundSummary -> continueToNextRound -> roundStart` 推进，只是 `isTiebreaker = true`。

## 只读 UI 操作

规则、回合记录、弃牌区、设置面板是只读或轻量设置操作：

- **不**进入 `GameState`：`panels` 状态由 `useGameController` 用 `useState` 维护（V1 钉死，不写进 GameState）。
- **不**改变 `phase`。
- **不**改变 Bet 倒计时规则。
- **不**改变牌局随机结果。
- 设置变化只能影响音效、画面偏好等非规则状态。
- `openPanel / closePanel` 实际上是 `useGameController` 内部命令，**不** dispatch reducer action；`commands` 列表里保留是因为 UI 组件通过 hook 调用它们。

V1 **不**允许在只读面板打开时暂停 30 秒 Bet 倒计时——倒计时继续运行。若玩家在倒计时最后几秒打开弃牌区，超时仍按 `getTimeoutBetAction` 规则触发。

## 测试要求

- 主路径能从 `idle` 跑到 `gameOver`，覆盖 harness 4.3 seed A-J。
- 5 回合打满后按 Air 判定胜负。
- Air 相同按累计赢得底池（`playerPool` vs `aiPool`）判定。
- 仍相同进入一次决胜（`isTiebreaker = true`、`roundNumber = 5`）。
- 决胜后仍相同判平局（`endReason = "draw"`）。
- 无法支付呼吸成本立即结束（`cannotPayBreathingCost`），`roundNumber` 不递增。不足方 Air 归零，够方不扣这 1 点呼吸。
- 无法支付参加费立即结束（`cannotPayAnte`），**呼吸扣减不回滚**。不足方 Air 归零，够方正常扣呼吸 + 参加费。
- 双方同时不足参加费：双方 Air 归零进入 `gameOver`。
- 进入 Bet 前玩家未锁定时自动锁定推荐成手（`autoLocked = true`）。
- AI 未锁定成手时 `enterBetting` 写入 `missing-ai-locked-hand`，状态不推进。
- 玩家在 AI 未预选数字牌时选牌，写入 `missing-ai-number-card`，状态不推进。
- Bet 阶段 reducer 对 `lockPlayerHand` 写入 `wrong-phase`。
- AI 数字牌在玩家 `selectNumberCard` 之前已写入 `publicTargets`（通过 seed A 验证 reducer 顺序）。
- 决胜回合费用按 R5 = 5 扣。
- `restartGame` 强制新 seed，不复用当前 seed。
- `updateSettings` 不改变 `phase`，不触发 reducer 状态推进。
- reducer 对错误阶段 action 返回 `{ ok: false, code: "wrong-phase" }` 写入 `lastError`，不抛异常。
- `roundHistory` 每条都带 `escrow`、`resolution`、`betActions`，并只在 `resolveRound` 后追加。

## 实现注意

- reducer 必须是纯函数。
- AI 决策由 `round-flow.ts` 同步编排，结果作为系统 action 进入 reducer；UI 层不直接调用 AI。
- 面板（panels）状态在 `useGameController` 内部 `useState` 维护，不进入 `GameState`。
- 不要在 UI 组件中直接拼接跨阶段状态变化。
- `currentRound` 各阶段字段严格按"阶段字段矩阵"段落的表执行；类型层用 discriminated union 表达（实现细节，但接口契约按本表）。
- 跨阶段读取不存在字段时 TypeScript 应编译失败（discriminated union 保证）；运行期不应发生，开发错误测试拦截。
