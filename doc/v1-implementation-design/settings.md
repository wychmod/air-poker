# 设置与持久化协议

日期：2026-06-21  
适用范围：`doc/v1-implementation-design/09-app-services.md` 的实现参考。  
本文维护 Settings、最近一局摘要、`localStorage` 协议的固定结构；9 号文档只引用、不再展开。

## 1. Settings

### 1.1 类型

```ts
type Theme = "light" | "dark" | "system"

type Settings = {
  version: 1                          // schema 版本号，便于未来迁移
  soundEnabled: boolean               // 音效开关
  theme: Theme                        // 画面主题
  reduceMotion: boolean               // 减少动画（可访问性）
  showAIDebug: boolean                // 调试用：AI 评分明细 / reason 展示
}
```

### 1.2 字段约束

- 所有字段都有默认值；旧版本解析失败时按默认值兜底。
- **Settings 不得包含任何会影响当前牌局规则、随机结果、Air、牌库、数字牌、AI 决策或状态机阶段的字段。**
- 增加新字段时必须显式列默认值并 bump `version`；读取端按 `version` 决定是否走迁移分支。

### 1.3 默认值

```ts
const DEFAULT_SETTINGS: Settings = {
  version: 1,
  soundEnabled: true,
  theme: "system",
  reduceMotion: false,
  showAIDebug: false
}
```

### 1.4 API 契约

- `loadSettings(): Settings`
  - `localStorage` 读取成功且 `version` 匹配：返回解析结果。
  - 无数据 / `version` 不匹配 / 解析失败：返回 `DEFAULT_SETTINGS`。
  - 不抛异常；错误日志由调用方决定是否记录。
- `saveSettings(settings: Settings): { ok: true } | { ok: false, code: "storage-unavailable" }`
  - 写入前用 `JSON.stringify` 序列化；写入后读回一次校验。

## 2. LastResultSummary

### 2.1 类型

```ts
type Outcome = "playerWin" | "aiWin" | "tie"
type EndReason =
  | "airDepleted"        // 某方 Air ≤ 0 提前结束
  | "fiveRounds"         // 5 回合打满，Air 分出胜负
  | "tiebreaker"         // 决胜回合分出胜负
  | "earlyTermination"   // 牌库或数字牌无法继续，提前结算
  | "draw"               // 决胜后仍平

type LastResultSummary = {
  version: 1
  seed: string
  outcome: Outcome
  endReason: EndReason
  finalPlayerAir: number
  finalAiAir: number
  roundsPlayed: number              // 实际进行的回合数（含决胜）
  playerPool: number                // 玩家累计赢得底池（不含参加费）
  aiPool: number                    // AI 累计赢得底池（不含参加费）
  calamityCount: number             // 触发灾厄的回合数
  playerAllInCount: number          // 玩家本局 all-in 次数（V1 调试用，可选）
  aiAllInCount: number              // AI 本局 all-in 次数
  timestamp: string                 // ISO 8601
}
```

### 2.2 字段约束

- `outcome` 与 `endReason` 一致性：
  - `outcome = "tie"` 时 `endReason ∈ {"fiveRounds" 决胜后仍平, "draw", "earlyTermination"}`。
  - `outcome ∈ {"playerWin", "aiWin"}` 时 `endReason ∈ {"airDepleted", "fiveRounds", "tiebreaker", "earlyTermination"}`。
- `roundsPlayed` 含决胜回合（决胜按 R5 计费，但 roundsPlayed 字段记录 6）。
- `playerPool + aiPool` 不必等于 0：参加费累计和消失 Air 也可能不归零。
- 写入前移除 `roundsPlayed` 之外的逐回合详情，避免 localStorage 体积爆炸。

### 2.3 写入时机

- 仅在 `GameState.phase === "gameOver"` 后调用 `persistResultIfGameOver`。
- 同一 gameOver state 多次调用不得写出不同摘要（deep equal 校验）。
- 玩家点击 `restartGame` 之前已写入；新局开始时不重置 last-result。

### 2.4 API 契约

- `loadLastResult(): LastResultSummary | null`
  - 解析成功且 `version` 匹配：返回对象。
  - 无数据 / `version` 不匹配 / 解析失败：返回 `null`，并删除旧 key。
  - 不抛异常。
- `saveLastResult(summary: LastResultSummary): { ok: true } | { ok: false, code: "storage-unavailable" }`
  - 写入前用 `JSON.stringify` 序列化；写入后读回一次校验。

## 3. localStorage 协议

### 3.1 Key 规范

所有 localStorage key 一律使用 `air-poker.` 前缀：

| Key | Value 类型 | 写入时机 | 读取时机 |
| --- | --- | --- | --- |
| `air-poker.settings` | `Settings`（JSON） | settings 变化时即时 | 启动时 / 打开 SettingsPanel 时 |
| `air-poker.last-result` | `LastResultSummary`（JSON） | gameOver 时 | 启动时 / 打开 StartScreen 时 |

### 3.2 版本与迁移

- 当前 schema 版本号 = 1。
- 读取时若 `version` 不匹配：返回默认值 / null，删除旧 key。
- V1 不实现自动迁移；bump version 时手动写迁移函数（V2+ 任务）。

### 3.3 错误处理

- `localStorage` 不可用（隐私模式 / quota 满 / 浏览器禁用）：写入返回 `{ ok: false, code: "storage-unavailable" }`，UI 静默降级（设置不持久化、结果不显示在 StartScreen）。
- 不向游戏流程抛出 localStorage 错误。

### 3.4 不保存的内容

显式禁止写入 localStorage：

- 当前进行中的 GameState / RoundState（V1 不实现半局恢复）。
- 完整回合历史（仅记录到 `roundsPlayed` 等汇总字段）。
- AI 决策明细（`showAIDebug` 开启时也仅在内存中显示，不持久化）。
- 任何会影响牌局规则和随机结果的字段。

## 4. crypto fallback seed 格式

当 `crypto.getRandomValues` 不可用时，runtime seed 降级为：

```text
<ISO 时间戳（毫秒精度）>-<Date.now() 自增 counter 4 位 hex>
```

例：`2026-06-21T15:49:58.123Z-0001`。同一毫秒内连续开新局通过 counter 自增区分，避免 seed 碰撞。

`createSeededRng` 收到 `string` seed 时统一走 `xfnv1a` hash + `sfc32` PRNG（详见 `01-cards-rng-and-deck.md` 附录 A）；`number` seed 直接作为 sfc32 初始 state。
