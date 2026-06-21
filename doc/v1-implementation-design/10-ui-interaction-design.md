# 10. UI 交互实现设计

## 目标

设计 React 层的组件边界和用户操作到 `GameAction` 的映射。本文只写交互和状态连接，不写具体视觉样式；页面布局和样式放在最后一份文档。

## 依赖

- `07-game-state-and-round-flow.md`
- `08-ai-controller.md`
- `09-app-services.md`

## 建议文件

- `src/ui/hooks/use-game-controller.ts`
- `src/ui/selectors/*.ts`（纯函数 selector 集合）
- `src/ui/screens/game-screen.tsx`
- `src/ui/screens/start-screen.tsx`
- `src/ui/screens/result-screen.tsx`
- `src/ui/panels/lower-panel.tsx`
- `src/ui/panels/upper-panel.tsx`
- `src/ui/panels/betting-panel.tsx`
- `src/ui/panels/showdown-panel.tsx`
- `src/ui/panels/round-summary-panel.tsx`
- `src/ui/components/*`

错误码统一在 `errors.md` §10 维护。

## 详细组件与 Hook 契约

### `useGameController(): GameController`

作用：React 层唯一牌局控制入口。

参数：

- 无直接参数。内部从 app service 读取设置和最近一局摘要。

返回：

```ts
type GameController = {
  state: GameState                      // 当前 GameState
  selectors: Selectors                  // 见下文 selectors 段
  commands: Commands                    // 见下文 commands 段
  panels: PanelState                    // 见下文 panels 段
  aiAllInState: { count: number, lastAllInRound: number | null }  // 跨回合持久化的 AI 私有状态
  isAiThinking: boolean                 // 当前是否在等待 AI 决策（不超过 1 个微任务）
}
```

**内部状态（V1 钉死，useGameController 持有）**：

- `state: GameState`（`useReducer` 管理，初始 `createIdleState()`）。
- `panels: PanelState`（`useState`，**不**进入 GameState）。
- `aiAllInState: { count, lastAllInRound }`（`useRef`，跨回合持久化）。
- `isAiThinking: boolean`（`useState`）。
- `betTimerRef: useRef<number | null>`（30 秒超时定时器句柄）。
- `lastPersistedResultRef: useRef<GameState | null>`（避免 gameOver 副作用重复触发）。
- `inFlightCommandRef: useRef<Set<CommandName>>`（防重复点击，详见 `commands` 段）。

**commands 类型**（V1 钉死，全部返回 `{ ok: true } | { ok: false, code: string }`，不抛异常）：

```ts
type Commands = {
  startNewGame: (seed?: string) => CommandResult
  selectNumberCard: (numberCardId: NumberCardId) => CommandResult
  lockPlayerHand: (handId: HandId) => CommandResult
  useRecommendedHand: () => CommandResult
  enterBetting: () => CommandResult
  submitBetAction: (action: BetAction) => CommandResult
  confirmDangerousAction: (actionId: string, confirmed: boolean) => CommandResult
  continueToNextRound: () => CommandResult
  restartGame: () => CommandResult
  openPanel: (panelType: PanelType) => CommandResult
  closePanel: (panelType?: PanelType) => CommandResult
  updateSettings: (patch: Partial<Settings>) => CommandResult
}

type CommandResult = { ok: true } | { ok: false, code: string }
```

`openPanel / closePanel / updateSettings` **不** dispatch reducer action；它们直接修改 `panels` / `settingsSnapshot` 局部状态。

**防重复点击（V1 钉死）**：

- 每次 command 调用前检查 `inFlightCommandRef.current.has(commandName)`：已 in-flight 则直接返回 `{ ok: false, code: "command-rejected" }`。
- 调用结束时（无论成功失败）从 `inFlightCommandRef.current.delete(commandName)`。
- 关键命令（`submitBetAction` / `lockPlayerHand` / `selectNumberCard` / `continueToNextRound` / `restartGame`）强制防重复；其他命令（`openPanel` / `updateSettings`）可放行。

**panels 类型**：

```ts
type PanelType = "rules" | "history" | "discardPile" | "settings"
type PanelState = Record<PanelType, boolean>  // 哪些面板当前打开
```

打开 `settings` 面板时：若 `panelState.settings === true`，`openPanel("settings")` 返回 `{ ok: false, code: "panel-already-open" }`；`closePanel` 关闭未打开的面板返回 `{ ok: false, code: "no-panel-open" }`（仅对 `closePanel` 严格；`openPanel` 是幂等的，多重打开不视为错误）。

**AI 决策编排（V1 钉死）**：

- `useGameController` 不直接调用 AI 函数。
- `useGameController` 持有 `round-flow.ts` 提供的编排函数（`runLowerAI / runUpperAI / runBettingAI`），由它们内部调用 `chooseLowerNumberCard / chooseUpperHand / chooseBetAction`。
- 调用方式：`setIsAiThinking(true)` → `Promise.resolve().then(() => dispatch(aiAction))` → `setIsAiThinking(false)`。微任务确保 React 渲染一次 loading 状态。

**Bet 30 秒定时器（V1 钉死）**：

- `useEffect` 监听 `state.phase === "betting" && state.currentRound.betState.status === "awaitingPlayer"`。
- 进入该条件时启动 `setTimeout(callback, 30000)`，callback 调用 `getTimeoutBetAction` 并 dispatch。
- 离开条件（phase 变化 / 玩家主动提交）时清理 timer。
- timer 句柄存 `betTimerRef.current`，组件 unmount 时一并清理。

**失败方式**：

- command 不抛异常到组件；非法操作返回 `{ ok: false, code }` 或写入 `state.lastError`（视 command 而定）。
- UI 组件根据 `code` 决定展示策略（toast / inline 提示 / 阻断操作）。

**禁止事项**：

- 组件不得绕过 hook 直接调用 reducer。
- 组件不得直接调用 AI 函数。
- 组件不得直接写 localStorage。

### `StartScreen`

作用：展示起始状态和全局入口。

Props：

- `lastResult`: 最近一局摘要或 null。
- `settings`: 当前设置。
- `onStartNewGame(seed?)`
- `onOpenRules()`
- `onOpenSettings()`

返回：

- React element。

状态约束：

- 不持有 GameState。
- 不生成 seed；seed 由 app service 或 controller 生成。

### `GameScreen`

作用：牌局主容器，根据 phase 组合各阶段 panel。

Props：

- `state`
- `selectors`
- `commands`

返回：

- React element。

职责：

- 展示顶部状态栏。
- 根据 `state.phase` 显示下层、上层、Bet、摊牌、回合摘要。
- 不做规则判断，只消费 selectors。

### `LowerPanel`

作用：下层数字牌选择。

Props：

- `numberCards`: 玩家数字牌展示模型。
- `publicTargets`: 本回合和历史公开目标值。
- `deckSummary`
- `disabledReasonsByCardId`
- `onSelectNumberCard(id)`
- `onInspectNumberCard(id)`

事件返回：

- 点击可选数字牌时调用 `onSelectNumberCard`。
- 点击不可选数字牌时不提交选择，只展示禁用原因。

### `UpperPanel`

作用：展示候选成手并锁定玩家隐藏成手。

Props：

- `targetValue`
- `candidateHands`: 已含牌型、用过牌状态、风险提示的展示模型。
- `lockedHandId`
- `canEnterBetting`
- `onLockHand(handId)`
- `onUseRecommendation()`
- `onEnterBetting()`
- `onInspectHand(handId)`

事件返回：

- 选择候选组合触发 `onLockHand`。
- 推荐按钮触发 `onUseRecommendation`。
- 进入 Bet 前若无 lockedHand，由 controller 自动推荐锁定。

禁止事项：

- 不在组件内重新计算“最强组合”。
- 不在组件内判断 HandEvaluator 结果。

### `BettingPanel`

作用：展示 Bet 状态、合法动作和倒计时。

Props：

```ts
type BettingPanelProps = {
  betState: BetState
  legalActions: LegalBetAction[]
  timer: { remainingMs: number, totalMs: number } | null
  isPlayerTurn: boolean
  onSubmitAction: (action: BetAction) => void
  onRequestDangerousConfirm: (action: BetAction) => void
}
```

事件返回：

- 普通动作（`check` / `call` / `bet` / `raise`）直接 `onSubmitAction`。
- `fold` 和 `allIn` 先 `onRequestDangerousConfirm`；hook 内部弹模态确认。
- `raise/bet` 金额必须来自受控输入（步进器 + 数字输入框，详见 11 文档），提交前仍由 BettingEngine 校验（`validateBetAction` 二次校验）。
- 禁用按钮显示原因：
  - 用 `title` 属性（鼠标 hover）+ 按钮下方小字（移动端长按显示）。
  - 原因文本来自 `legalActions[i].disabledReason`（错误码 + 人类可读消息）。
- 倒计时：30s 圆形进度环 + 数字秒数；颜色按 `remainingMs` 切换（30-10s 绿 / 10-5s 黄 / 5-0s 红，详见 11 文档）。

### `ShowdownPanel`

作用：展示双方摊牌结果。

Props：

- `playerHand`
- `aiHand`
- `overlappingCardIds`
- `betEscrow`
- `onContinueToResolution()`

返回：

- 只读展示，不触发规则重算。

### `RoundSummaryPanel`

作用：展示本回合结算和下一步。

Props：

- `resolution`
- `deckSummary`
- `roundNumber`
- `canContinue`
- `onContinueToNextRound()`
- `onOpenDiscardPile()`
- `onOpenCalamityDetails()`

### `ResultScreen`

作用：展示整局结算。

Props：

- `resultSummary`
- `roundHistory`
- `onStartNewGame()`
- `onOpenRoundHistory()`
- `onOpenSettings()`

## Selector 契约

selectors 是 UI 使用的派生数据层，放在 `src/ui/selectors/` 下，每个 selector 是**纯函数**：

- `selectPhaseTitle(state): string` — 当前阶段的中文标题。
- `selectAirDisplay(state): AirDisplayModel` — `{ player: number, ai: number, delta?: number }`，供顶部状态栏。
- `selectPlayerNumberCards(state): NumberCardViewModel[]` — 含 `disabledReason` 的展示模型。
- `selectCandidateHandViewModels(state): CandidateHandViewModel[]` — 含牌型评级、灾厄风险、用过牌标记。
- `selectLegalBetActionViewModels(state): BetActionViewModel[]` — 含 `disabledReason` 和金额范围。
- `selectRoundSummaryViewModel(state): RoundSummaryViewModel` — 回合摘要的展示模型。
- `selectShowdownViewModel(state): ShowdownViewModel` — 摊牌时双方成手对比。
- `selectTimerState(state): { remainingMs: number, totalMs: number } | null` — 30s 倒计时（基于 `betState.turnStartedAt`）。

selector 约束：

- 纯函数，不修改 state。
- 不调用 `Math.random()` / `crypto`。
- 不调用 AI 函数。
- 可以调用 `domain/` 的纯比较函数（`HandEvaluator` / `BettingEngine.getLegalBetActions` 等）。
- 不发起网络请求、不访问 `localStorage`。
- selector 内部抛异常视为开发错误，由测试拦截。

## Controller hook

`useGameController` 负责：

- 持有 `GameState`。
- 调用 app service 创建新局。
- 暴露用户事件函数。
- 将用户事件转换为 `GameAction`。
- 在需要时触发 AI 和系统自动 action。

UI 组件不直接调用 domain 复杂函数，只调用 hook 提供的命令。

## 起始状态交互

用户可操作：

- 开始新局（`commands.startNewGame()`）。
- 查看规则说明（`commands.openPanel("rules")`）。
- 调整设置（`commands.openPanel("settings")`，在 SettingsPanel 内 `updateSettings`）。
- 查看最近一局摘要（`commands.openPanel("history")`，从 `StartScreen` 接收 `lastResult` prop 展示）。

`开始新局` 映射：

- `commands.startNewGame(seed?)` dispatch `startNewGame` action。
- 初始化成功进入 `roundStart`，`round-flow.ts` 立即调用 `applyRoundCosts` → `lowerSelect`。

## 下层阶段交互

显示：

- 玩家剩余数字牌（按 `numberCards.player` 过滤 `status === "available"`）。
- 每张数字牌可解状态（`selectPlayerNumberCards` 中 `disabledReason`）。
- 已公开目标值记录（`currentRound.publicTargets`）。
- 当前 Air 和回合数。
- AI 已预选数字牌（在 `selectNumberCard` 之前已展示）。

操作：

- 点击可解数字牌 → `commands.selectNumberCard(id)`。
- 点击不可解数字牌 → 不 dispatch，鼠标 hover 显示 `disabledReason`（如"当前牌库无法组成"）。
- 查看数字牌 proofHand → 只读面板（`openPanel("discardPile")` 不适用；proofHand 在 02 文档中保留，UI 不展示，调试时通过 `showAIDebug` 间接观察）。

AI 数字牌必须在公开时同时展示，**不允许** UI 表现成"看玩家选完后 AI 才想"（详见 07 文档 AI 时序段）。

## 上层阶段交互

显示：

- 玩家目标值（`currentRound.publicTargets.playerNumberCardId`）。
- 候选成手列表（`selectCandidateHandViewModels`）。
- 每组牌型评级（`categoryRank` + `label`）。
- 用过牌失效标记（`usage === "used"` 的牌视觉降级 + 斜线，详见 11 文档）。
- 灾厄风险提示（`averageOverlapRiskAgainstAiHand`）。

操作：

- 点击组合 → `commands.lockPlayerHand(handId)`。
- 推荐最强组合 → `commands.useRecommendedHand()`。
- 更换组合 → 再次 `commands.lockPlayerHand(handId)`。
- 进入 Bet → `commands.enterBetting()`；若无 `playerLockedHand`，hook 自动调用推荐策略锁定并设 `autoLocked = true`（详见 07 文档 `enterBetting` 段）。

进入 Bet 后候选区变为只读（`currentRound.phase` 切换为 `"betting"` 时 `UpperPanel` 切换为只读模式）。

## Bet 阶段交互

显示：

- 当前行动方（`betState.status` + 头像/标签）。
- 玩家下注额（`betState.playerBet`）。
- AI 下注额（`betState.aiBet`）。
- 本回合可下注上限（`getTotalBetLimit`）。
- 合法动作按钮（`selectLegalBetActionViewModels`）。
- 30 秒倒计时（`selectTimerState`，仅玩家回合显示）。

操作：

- `check` → `commands.submitBetAction({ type: "check", amount: 0, actor: "player" })`。
- `call` → `commands.submitBetAction({ type: "call", amount: getCallAmount, actor: "player" })`。
- `bet / raise` → 使用步进器 + 数字输入框选择金额，再 `commands.submitBetAction`。
- `fold` → `commands.confirmDangerousAction("fold", true)` 二次确认后提交。
- `all-in` → `commands.confirmDangerousAction("allIn", true)` 二次确认后提交。
- 超时 → hook 内部 `getTimeoutBetAction` + `submitBetAction`，**不**通过用户命令。

所有禁用按钮必须给出原因，例如 Air 不足、不是当前行动方、raise 超上限。

## 摊牌与结算交互

摊牌显示：

- 玩家 lockedHand。
- AI lockedHand。
- 双方牌型。
- 重叠有效牌。
- Bet escrow。

结算显示：

- 胜负。
- Air 变化。
- 灾厄是否触发。
- 消失 Air。
- 进入弃牌区的有效牌。

用户操作：

- 查看灾厄详情。
- 查看弃牌区。
- 进入下一回合。
- 游戏结束时进入结果页。

## 跨阶段只读操作

- 查看规则。
- 查看回合记录。
- 查看弃牌区。
- 调整设置。

这些操作不得改变 `GameState.phase`，不得触发 AI 决策重算，Bet 倒计时是否继续由 hook 统一控制。V1 建议打开只读面板时倒计时继续运行。

## 测试要求

- 组件只通过 props 和 hook 事件工作，不直接改 GameState。
- 下层不可解数字牌按钮禁用，hover 显示 `disabledReason`。
- 上层进入 Bet 前自动锁定推荐成手（`autoLocked = true`）。
- Bet 阶段只展示合法动作。
- fold / all-in 有二次确认（`commands.confirmDangerousAction`）。
- 重复点击确认只处理第一次：`inFlightCommandRef` 防重复；测试用快速连点 3 次确认按钮验证只 dispatch 1 次。
- 只读面板打开不改变 `state.phase`、不暂停 30s 倒计时。
- 30s 超时定时器在玩家回合启动，离开时清理；unmount 时也清理（无泄漏）。
- AI 决策时 `isAiThinking === true` 至少持续一个微任务。
- `useGameController` 内部 `panels` 状态不进入 GameState。
- 阶段切换不丢失 `aiAllInState`（跨回合持久化）。
- React 严格模式下副作用不重复触发（`lastPersistedResultRef` 防止 gameOver 写入双触发）。

## 实现注意

- UI 层不保存第二份业务状态（`panels` / `isAiThinking` 等 UI 局部状态除外），避免与 reducer 不一致。
- 复杂派生数据应来自 selector，而不是散落在组件中临时计算。
- 不要在组件中直接调用 AI；AI 调用由 `useGameController` 通过 `round-flow.ts` 编排（详见上文"AI 决策编排"段）。
- 不要在组件中直接读 `localStorage`；设置与最近一局摘要由 `app-service` 适配层提供，UI 通过 hook 获取。
- 阶段切换时不要"瞬时渲染中间态"——例如 `enterBetting` 触发 `lockPlayerHand + enterBetting` 两次 dispatch 时，用 `useTransition` 或 `flushSync` 控制，避免 UI 闪烁两次。
