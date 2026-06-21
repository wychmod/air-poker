# Air Poker V1 技术架构设计

日期：2026-06-21  
版本：V1  
依据：
- `doc/2026-06-18-air-poker-v1-design.md`
- `doc/2026-06-20-air-poker-v1-user-flow.md`

## 1. 架构目标

Air Poker V1 是一个 Chrome 浏览器可运行的纯前端单机游戏。第一版不做账号、后端、联机、数据库和云存档。

技术架构的重点不是服务端能力，而是把复杂规则稳定拆开：
- 牌库与实体牌管理
- 数字牌生成与可解校验
- 5 张成手枚举
- 原作牌型序位比较
- 下层、上层、Bet、摊牌、结算的阶段状态机
- AI 的公平信息边界
- 灾厄、参加费、呼吸成本、Air-BIOS 结算
- 可测试、可调试、可部署

## 2. 推荐技术栈

V1 推荐使用：

```text
TypeScript + React + Vite + Vitest
```

### 2.1 语言：TypeScript

选择 TypeScript 的原因：
- 游戏规则对象很多，例如 `Card`、`NumberCard`、`Hand`、`GameState`、`BetAction`，需要类型约束。
- 状态阶段明确，适合用 discriminated union 表达不可混用的阶段数据。
- 纯前端部署简单，不需要额外运行环境。
- 后续如果要把规则迁移到服务端或 Web Worker，核心逻辑可以复用。

不建议 V1 使用纯 JavaScript。当前规则有较多边界条件，纯 JavaScript 更容易在状态字段、下注约束、牌型比较中产生隐性错误。

### 2.2 UI：React

选择 React 的原因：
- 游戏界面由多个状态驱动区域组成：玩家下层面板、AI 信息区、上层候选组合、下注控制区、摊牌与结算页。
- React 适合用组件表达这些区域，并根据 `GameState.phase` 控制可见性和可操作性。
- V1 不需要复杂动画框架，React 足够。

### 2.3 构建工具：Vite

选择 Vite 的原因：
- 适合单页前端游戏原型。
- 启动和构建快。
- 静态构建产物是 `dist/`，部署到 Cloudflare Pages、GitHub Pages、Netlify、Vercel 都简单。

### 2.4 测试：Vitest

选择 Vitest 的原因：
- 与 Vite/TypeScript 集成直接。
- 适合测试纯规则模块。
- V1 最需要测试的是规则正确性，而不是端到端流程数量。

## 3. 不采用的方案

### 3.1 不使用后端

V1 不建议引入 Node.js 后端、Java、Go、Python API 服务或数据库。

原因：
- 当前需求明确是纯前端单机。
- 没有账号、匹配、联机、排行榜、云存档。
- 后端会增加部署复杂度，但对 V1 核心玩法没有直接收益。

### 3.2 不使用 Next.js

V1 不建议使用 Next.js。

原因：
- 项目不需要 SSR、服务端路由、API Route 或复杂 SEO。
- Vite 的静态部署模型更轻。
- Next.js 会让部署和目录结构更重。

### 3.3 暂不使用全量状态机框架

V1 可以先使用 `useReducer` + 明确的 `GamePhase` 类型管理状态。

如果后续状态转移继续变复杂，再考虑引入 XState。第一版不必提前增加依赖。

## 4. 推荐目录结构

```text
src/
  domain/
    cards/
      card.ts
      deck.ts
      number-card-generator.ts
    hand/
      hand-solver.ts
      hand-evaluator.ts
      hand-ranking.ts
    betting/
      betting-engine.ts
      betting-rules.ts
    calamity/
      calamity-engine.ts
    ai/
      lower-ai.ts
      upper-ai.ts
      betting-ai.ts
      ai-controller.ts
    game/
      game-state.ts
      game-actions.ts
      game-reducer.ts
      round-flow.ts

  app/
    persistence.ts
    settings.ts
    rng.ts

  ui/
    components/
    panels/
    screens/
    hooks/

  tests/
```

目录边界原则：
- `domain/` 只放游戏规则，不依赖 React、不访问 DOM、不读写 `localStorage`。
- `app/` 负责浏览器环境相关的编排，例如设置、本地存储、随机数注入。
- `ui/` 只负责展示和用户交互，把用户动作转换成 `GameAction`。
- `tests/` 优先覆盖 `domain/` 规则。

## 5. 核心模块边界

### 5.1 DeckManager / cards

职责：
- 构建 52 张实体扑克牌。
- 洗牌。
- 生成 `burnCards`。
- 维护共享牌库与弃牌区。
- 根据本回合双方使用的实体牌更新牌库。

关键约束：
- 数字牌生成、成手枚举、灾厄判断、弃牌区都必须基于同一副实体牌。
- 每张实体牌需要稳定 ID，例如 `S-A`、`H-10`。

### 5.2 NumberCardGenerator

职责：
- 从洗好的 52 张实体牌中抽出 2 张 `burnCards`。
- 将剩余 50 张分成 10 组，每组 5 张。
- 每组求点数和生成 1 张数字牌。
- 保存每张数字牌的 `proofHand`。
- 分配玩家与 AI 的 5 张数字牌，并控制双方总和差距不超过 30（硬阈值）。
- 对开局数字牌执行可解校验。

### 5.3 HandSolver

职责：
- 给定当前共享牌库（含弃牌区里可选用但失效的牌）和目标值，枚举所有点数和等于目标值的 5 张成手。
- 返回候选组合列表及数量；每张牌带「未用过 / 已用过」标记。
- 支持下层阶段的数字牌可解判断（仅算未用过牌）。

实现建议：
- V1 牌库最多 52 张，枚举 5 组合数量可接受。
- 先用直接组合枚举实现，保持可读和可测。
- 如果后续性能不足，再加入缓存或 Web Worker。
- 枚举时一并标记"含用过牌组合"，便于上层预览 UI 区分展示。

### 5.4 HandEvaluator

职责：
- 按原作序位评价 5 张牌：
  1. Royal Straight Flush
  2. Straight Flush
  3. Four of a Kind
  4. Full House
  5. Flush
  6. Straight
  7. Three of a Kind
  8. Two Pair
  9. One Pair
  10. High Card
- 支持同牌型比较。
- 明确 V1 的 A 强弱口径：牌型比较中 A 为最强，数字点数求和中 A = 1。
- **支持有效牌数量降级判定**（"用过牌可选但失效"机制，详见设计文档 6.3 节）：
  - 接受 `effectiveCards: Card[]`（5 张选中牌去除失效牌后的剩余牌）。
  - 按有效牌数量（0-5）选用对应判定规则，0 张有效判负。
  - 同牌型比较时按有效牌数少的视为弱牌型（5 张 vs 4 张的同牌型比较 = 5 张胜）。

### 5.5 BettingEngine

职责：
- 根据当前 Air、已下注额、行动方和阶段生成合法动作。
- 校验 `check`、`call`、`raise`、`fold`、`all-in`。
- 执行 V1 下注收敛规则：
  - 玩家先动。
  - AI 响应一次。
  - 若 AI `raise` 或 `all-in`，玩家再响应一次。
  - 玩家响应后 Bet 必定结束。

关键约束：
- Raise 上限 = 当前场上 Bet 总额的 `1/2`。
- 本回合总 Bet 上限 = 双方剩余可下注 Air 中较少者。
- 呼吸成本和参加费已经扣除，不能再用于下注。

### 5.6 CalamityEngine

职责：
- 判断双方最终锁定的 5 张成手是否存在实体牌重叠。
- **仅比较"有效牌"的重叠**——用过失效牌不参与灾厄重叠判断（因为它们没真正参与本回合使用）。
- 若触发灾厄，结算流程：
  - **正常 Bet 结算**：胜者拿到对手下注额；输家失去对手下注额。
  - **灾厄额外**：输家额外扣减掉**自己下注额**（消失到水中，不归属任何一方）。
  - 输家净亏 = 池子总额；胜者净赚 = 对方下注额；消失 Air = 输家自己下注额。
  - 注意：不是 "Bet 总额 × 2"——之前表述错误已在 2026-06-21 订正，详见设计文档 6.6。

Fold 后仍按双方内部锁定成手判断灾厄；弃牌方视为本回合输家。

### 5.7 AIController

AI 拆成三层：
- `LowerAI`：选择数字牌。
- `UpperAI`：锁定 5 张成手。
- `BettingAI`：下注决策。

公平边界：
- AI 可以看到玩家公开目标值、共享牌库、弃牌区、双方 Air、底池、玩家可能成手集合。
- AI 不能读取玩家已经暂定的隐藏成手。

实现原则：
- V1 使用规则评分 AI，加少量随机扰动。
- AI 决策输入必须显式传入，避免从全局状态偷读隐藏信息。
- AI 每次决策返回可解释原因，方便调试 UI 展示。

## 6. 游戏状态机

V1 使用显式阶段状态：

```text
idle
  -> initializing
  -> roundStart
  -> lowerSelect
  -> solveHands
  -> upperSelect
  -> betting
  -> showdown
  -> resolve
  -> roundSummary
  -> gameOver
```

核心流转：

```text
开始新局
  -> 初始化牌库、数字牌、Air
  -> 每回合扣呼吸成本和参加费
  -> 玩家选择数字牌，AI 同步公开预选数字牌
  -> 枚举双方合法成手
  -> 玩家暂定成手，AI 内部锁定成手
  -> Bet
  -> 同时摊牌
  -> 牌型结算
  -> 灾厄结算
  -> 弃牌区更新
  -> 下一回合或游戏结束
```

状态管理建议：
- 用 `GameState` 表达完整状态。
- 用 `GameAction` 表达用户动作、AI 动作和系统自动动作。
- 用 `gameReducer(state, action)` 生成新状态。
- 不允许 UI 组件直接修改状态对象。

## 7. 数据与持久化

V1 默认只在内存中保存当前牌局。

`localStorage` 只保存：
- 音效开关
- 画面偏好
- 最近一局结果摘要

V1 不恢复刷新前的半局状态。刷新或关闭页面后，用户重新开始新局。

如果未来要支持存档，应只在阶段完成边界保存快照，不能保存到半次点击、半次下注或 AI 决策中间态。

## 8. 测试策略

V1 测试重点放在纯规则模块。

最低测试覆盖：
- 52 张牌构建无重复。
- 数字牌生成总和关系正确。
- 数字牌双方分配差距不超过 30（硬阈值，超过则重新洗牌）。
- `HandSolver` 能找出目标值合法组合，且不返回错误点数和。
- `HandSolver` 枚举时正确标记"含用过牌组合"。
- `HandEvaluator` 覆盖 10 种牌型和同牌型比较。
- `HandEvaluator` 支持有效牌数量降级判定（5/4/3/2/1/0 张，0 张判负）。
- 玩家可选弃牌区里的用过牌，选中后立即失效。
- 失效牌不参与灾厄重叠判断。
- 失效牌不重新进入本回合弃牌区更新。
- Bet 合法动作生成与非法动作拒绝。
- Raise 上限和总 Bet 上限。
- Fold 后结算。
- 灾厄触发与 Air 差额消失。
- 状态机主路径能完整跑完 5 回合或提前结束。
- AI 决策不能访问玩家隐藏成手字段。

UI 测试 V1 可以保持轻量，优先用人工验收配合少量组件测试。

## 9. 部署方案

V1 使用静态部署。

构建命令：

```text
npm run build
```

构建产物：

```text
dist/
```

推荐部署平台：
- Cloudflare Pages：首选，静态站点部署简单，免费额度足够。
- GitHub Pages：适合开源仓库，但需要处理 Vite `base` 路径。
- Netlify：适合快速预览。
- Vercel：可用，但 V1 不需要服务端能力。

部署约束：
- 不需要服务器进程。
- 不需要数据库。
- 不需要环境变量。
- 不需要 API 域名。
- 所有资源应随静态构建一起发布。

## 10. 后续扩展预留

### 10.1 Web Worker

如果后续 `HandSolver`、蒙特卡洛 AI 或大规模模拟影响 UI 流畅度，可以把计算移到 Web Worker。

V1 暂不需要提前实现，但 `domain/` 纯函数化可以保证迁移成本低。

### 10.2 联机模式

如果未来做联机，建议新增后端只负责：
- 房间与连接管理。
- 玩家动作收集。
- 权威状态推进。
- 隐藏信息隔离。

当前 `domain/` 规则模块可以迁移到服务端复用。V1 不为联机提前引入后端。

### 10.3 复盘系统

如果未来做复盘，可以记录：
- 初始随机种子。
- 每一步 `GameAction`。
- 每回合 AI 决策结果。

只要状态机是确定性的，就能从初始状态和 action 日志重放整局。

## 11. 结论

Air Poker V1 应采用：

```text
TypeScript + React + Vite + 纯前端静态部署
```

架构上把游戏规则做成独立 `domain/` 层，把 React 控制在 UI 层，把阶段推进收敛到明确状态机里。

这样能满足 V1 的单机纯前端目标，也为后续 Web Worker、复盘、AI 增强或联机后端保留清晰迁移路径。
