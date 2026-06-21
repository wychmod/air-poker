# 09. App Services 实现设计

## 目标

实现浏览器侧适配层：设置、本地存储、RNG 创建、最近一局摘要。该层连接 UI 与 domain，但不能把浏览器 API 泄漏进 domain。

## 依赖

- `01-cards-rng-and-deck.md`（Rng 类型、deck 操作）
- `07-game-state-and-round-flow.md`（GameState、GameAction）
- `settings.md`（Settings / LastResultSummary / localStorage 协议）
- `errors.md`（错误码总表）

## 建议文件

- `src/app/rng.ts`（与 01 文档重复归属：RNG 服务实现唯一在 `src/app/rng.ts`，01 文档只描述接口和错误码）
- `src/app/settings.ts`
- `src/app/persistence.ts`
- `src/app/game-session.ts`
- `src/app/*.test.ts`

错误码统一在 `errors.md` §9 维护。

## 详细 API 契约

### `createSeededRng(seed: string | number): Rng`

作用：创建跨浏览器可复现的随机函数。

参数：

- `seed`: 字符串或数字。
  - **空字符串 seed 视为非法**（V1 钉死），抛出 `{ code: "empty-seed" }`。
  - 实现细节见 01 文档附录 A（`xfnv1a` + `sfc32`）。

返回：

- `Rng`，每次调用返回 `[0, 1)`。

### `createRuntimeSeed(): string`

作用：给新局生成默认 seed。

返回：

- 字符串 seed。V1 固定格式（详见 `settings.md` §4）：
  - 优先：`<ISO 时间戳（毫秒精度）>-<crypto.getRandomValues 16 字节 hex>`。例：`2026-06-21T15:49:58.123Z-a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6`。
  - `crypto.getRandomValues` 不可用时降级为 `<ISO 时间戳>-<Date.now() 自增 counter 4 位 hex>`，**不抛错**。
- seed 必须可写入 URL（调试复现）、日志和 localStorage 摘要。

### `loadSettings(): Settings`

作用：从 localStorage 读取设置。

**类型与默认值详见 `settings.md` §1**。

返回：

- 读取成功且 `version === 1` 时返回解析结果。
- 无数据 / `version` 不匹配 / 解析失败：返回 `DEFAULT_SETTINGS`（见 `settings.md` §1.3），并删除旧 key。
- 不向 UI 抛异常；localStorage 错误转成默认设置和诊断日志。

### `saveSettings(settings: Settings): SaveResult`

作用：保存非规则设置。

参数：

- `settings`: `Settings` 对象（见 `settings.md` §1.1）。

返回：

- `{ ok: true }` 或 `{ ok: false, code: "storage-unavailable" }`。

安全要求：

- **设置不得包含任何会影响当前牌局规则和随机结果的字段**（V1 钉死，settings.md §1.2 列出允许字段）。`saveSettings` 写入前应过滤掉 `Settings` 类型外的字段（防御性）。
- 写入后读回一次校验，校验失败返回 `storage-unavailable`。

### `loadLastResult(): LastResultSummary | null`

作用：读取最近一局摘要。

**类型详见 `settings.md` §2.1**。

返回：

- 有合法摘要且 `version === 1` 时返回对象。
- 无数据 / `version` 不匹配 / 解析失败：返回 `null`，并删除旧 key。
- 不抛异常。

### `saveLastResult(summary: LastResultSummary): SaveResult`

作用：保存最近一局摘要。

参数：

- `summary`: gameOver 后生成的摘要。

返回：

- `{ ok: true }` 或 `{ ok: false, code: "storage-unavailable" }`。

限制（V1 钉死）：

- **只在 `GameState.phase === "gameOver"` 后调用**。其他阶段调用直接返回 `{ ok: false, code: "wrong-phase" }`，不写入。
- 不保存完整半局状态。
- 同一 gameOver state 多次调用不得写出不同摘要（`useGameController` 用 useRef 标记写入完成）。

### `createNewGameSession(input: NewGameSessionInput): GameSession`

作用：为 UI 创建一局新的应用会话。

参数：

```ts
type NewGameSessionInput = {
  settings: Settings
  seed?: string                         // 可选；不传则调用 createRuntimeSeed
  lastResult?: LastResultSummary | null // 仅展示用，不进入 GameState
}
```

返回：

```ts
type GameSession = {
  state: GameState                      // 初始 phase = "idle"，待 dispatch startNewGame
  seed: string                          // 最终使用的 seed（生成或传入）
  dispatch: (action: GameAction) => GameState  // 接收用户/系统 action，返回新 state
  lastResult: LastResultSummary | null  // 透传，供 StartScreen 展示
}
```

`dispatch` 接受 `GameAction`（`07-game-state-and-round-flow.md` 定义），**不抛异常**——非法 action 写入 `state.lastError`，返回原 state（深拷贝或新对象，依赖 reducer 实现）。

### `persistResultIfGameOver(state: GameState): SaveResult | null`

作用：当状态进入 gameOver 时保存最近一局摘要。

参数：

- `state`: 当前 GameState。

返回：

- `state.phase !== "gameOver"`：返回 `null`。
- `state.phase === "gameOver"`：写入 `LastResultSummary`，返回保存结果。

要求：

- 多次调用同一个 gameOver state 不得重复写出不同摘要。`useGameController` 用 useRef 标记"已写入"，避免 React 严格模式下副作用双触发。

## RNG 服务

职责：

- 创建 runtime seed。
- 根据 seed 创建可复现 RNG。
- 在新局初始化时把 seed 写入 GameState。
- 提供调试输出所需的 seed 字符串。

要求：

- 同一个 seed 生成同一串随机数。
- domain 只接收 `Rng` 函数。
- 最近一局摘要中记录 seed。

## 设置服务

详细类型与字段约束见 `settings.md` §1。简述：

- V1 设置只包含非规则项：音效开关、主题、减少动画、AI debug 展示。
- 设置可以即时保存到 `localStorage`。
- 设置变化**不得**影响当前牌局随机结果、Air、牌库、数字牌、AI 决策或状态机阶段（V1 钉死，settings.md §1.2）。

## 持久化服务

详细协议见 `settings.md` §3。简述：

- `localStorage` 只保存两个 key：`air-poker.settings`（`Settings`）、`air-poker.last-result`（`LastResultSummary`）。
- 所有 localStorage key 一律使用 `air-poker.` 前缀。
- 持久化数据带 `version: 1` 字段，便于未来迁移。
- V1 不实现自动迁移；bump version 时手动写迁移函数（V2+ 任务）。
- 不保存进行中的半局状态、AI 决策明细、逐回合详情。

## Game session 编排

`game-session.ts` 提供 UI 使用的薄封装，**纯 useReducer + useRef**，不引入额外状态管理库（zustand / Redux 等）。V1 不为单局游戏引入重状态管理。

API：

- `createNewGameSession(input): GameSession`（见上文）
- `dispatchGameAction(state, action): GameState`：纯函数包装，调用 `gameReducer`（07 文档）。
- `persistResultIfGameOver(state): void`：包装 `saveLastResult`，检查 `state.phase`、deep-equal 校验。

该层可以访问 `localStorage`，但**不得**把 `localStorage` 对象或 `window` / `document` 引用传入 `domain/` 任何模块。`domain/` 通过 `app/` 提供的接口（`saveSettings` / `loadSettings` 等）访问持久化层。

## 错误处理

本地存储不可用时（V1 钉死）：

- 设置读取返回 `DEFAULT_SETTINGS`。
- 设置写入失败只记录 console.warn，不中断游戏（设置下次启动仍是默认）。
- 最近一局摘要写入失败不影响结算（游戏正常进入 `gameOver`，只是不写入 `localStorage`）。

Seed 创建失败时（V1 钉死）：

- 优先 `crypto.getRandomValues`；不可用时按 `settings.md` §4 降级为时间戳 + counter。
- 不抛错；fallback seed 仍可复现（时间戳 + 启动 counter）。

## 测试要求

- 同 seed RNG 可复现（连续调用 1000 次序列 byte-equal）。
- 不同 seed 序列 99% 以上位置不同（前 5 个返回值至少有 3 个不同）。
- 固定 seed "test-seed-001" 的前 100 个随机数与 01 文档附录 A 的 reference 实现 byte-equal。
- `createSeededRng("")` 抛出 `empty-seed`。
- 设置能保存和读取：写入 `Settings`，读回 deep-equal。
- localStorage 抛错（mock）时 `loadSettings` 返回 `DEFAULT_SETTINGS`、`saveSettings` 返回 `storage-unavailable`。
- 设置写入后读回校验：mock 写入失败时返回 `storage-unavailable`。
- 最近一局摘要只在 `phase === "gameOver"` 时保存。
- 同一 gameOver state 多次调用 `persistResultIfGameOver` 不重复写盘（mock 写盘计数器）。
- 模拟"刷新页面"（重置 in-memory state）后 `loadLastResult` 不返回半局状态。
- `createNewGameSession` 不传 seed 时调用 `createRuntimeSeed`；传 seed 时直接使用。
- `createRuntimeSeed` 在 `crypto` 不可用时降级为时间戳 + counter seed，**不抛错**。
- `Settings.version` 不匹配时 `loadSettings` 返回 `DEFAULT_SETTINGS` 并删除旧 key。

## 实现注意

- `app/` 可以依赖 `domain/`，`domain/` 不能依赖 `app/`。
- 持久化数据需要版本号，例如 `{ version: 1, data }`，便于未来迁移。
- 不要把完整回合历史长期写入 localStorage；V1 只保存摘要。
