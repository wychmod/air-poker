# Air Poker V1 细分实现设计索引

日期：2026-06-21  
来源：
- `doc/2026-06-18-air-poker-v1-design.md`
- `doc/2026-06-20-air-poker-v1-user-flow.md`
- `doc/2026-06-21-air-poker-v1-architecture.md`
- `doc/2026-06-21-air-poker-v1-ai-development-quality-harness.md`

补充总表（实现期需要查的固定口径，本目录各文档均以这些为准）：
- `doc/v1-implementation-design/errors.md`：错误码总表
- `doc/v1-implementation-design/settings.md`：设置、最近一局摘要、localStorage 协议

## 目标

本目录把 V1 总设计拆成可逐项实现的细分设计文档。顺序按依赖关系排列：先写纯规则和数据结构，再写状态机和 AI，最后写 UI 页面、交互和样式。

这些文档不是替代总设计，而是给后续写代码时使用的落地口径。实现代码时应优先遵守本目录中明确写死的实现决策；若与源文档冲突，以本目录中“口径固定”段落为准，并在修改时同步回写源文档或修订记录。

## 实现顺序

| 顺序 | 文档 | 依赖 | 产出重点 |
| --- | --- | --- | --- |
| 1 | `01-cards-rng-and-deck.md` | 无 | 实体牌、牌值、稳定 ID、牌库、弃牌区、可注入 RNG |
| 2 | `02-number-card-generation.md` | 01 | 数字牌生成、burnCards、proofHand、双方平衡分配、补牌重算 |
| 3 | `03-hand-solver.md` | 01 | 5 张点数和枚举、用过牌可选但失效标记、可解校验 |
| 4 | `04-hand-evaluator.md` | 01、03 | 原作牌型序位、A 强弱口径、有效牌数量降级判定 |
| 5 | `05-betting-engine.md` | 01 | Bet 动作、合法动作生成、raise 上限、all-in、30 秒超时 |
| 6 | `06-round-resolution-and-calamity.md` | 01、04、05 | 牌型结算、参加费、灾厄、弃牌区与牌库更新 |
| 7 | `07-game-state-and-round-flow.md` | 01-06 | `GameState`、`GameAction`、阶段流转、提前结束、决胜 |
| 8 | `08-ai-controller.md` | 02-07 | LowerAI、UpperAI、BettingAI、公平信息边界、解释性输出 |
| 9 | `09-app-services.md` | 01-08 | 设置、本地持久化、seeded RNG、浏览器适配层 |
| 10 | `10-ui-interaction-design.md` | 07-09 | React 组件边界、用户操作到 action 的映射、无样式交互 |
| 11 | `11-ui-pages-and-visual-design.md` | 10 | 页面布局、视觉状态、响应式、样式细节 |

## 全局口径固定

> 引用原作术语时使用「Air-BIOS」；V1 文档其余场合统一使用「Air」。两条同义，不引入歧义。

- V1 是纯前端单机游戏，不引入后端、数据库、账号、联机或云存档。
- 技术栈固定为 TypeScript + React + Vite + Vitest。
- `domain/` 中的代码必须是纯规则，不依赖 React、DOM、`window`、`document`、`localStorage` 或浏览器事件。
- 随机过程必须可注入 RNG；domain 层不得直接调用 `Math.random()`。
- 错误码统一在 `errors.md` 维护；本目录各文档引用错误码时不另写本地枚举。
- 每局双方初始 Air 为 25。
- 每局最多 5 回合（R1-R5）；完成后若双方 Air 仍平，按累计赢得底池 → 决胜回合 → 仍平判平局的多级判定（详见 `07-game-state-and-round-flow.md`）。
- 每回合先扣呼吸成本 1 Air，再扣参加费 `R` Air，`R` 为当前回合数。决胜回合的 `R` 一律按 5 计。
- 参加费作为基础下注纳入结算：胜方拿回自己那份 `R` 参加费（净亏 0），负方承担自己那份 `R` 参加费（净亏 `R`）。Bet 部分按胜方全拿底池结算（详见 `06-round-resolution-and-calamity.md`）。
- 流程顺序固定为：扣呼吸 + 参加费 -> 下层公开数字牌 -> 上层私下锁定成手 -> Bet -> 同时摊牌 -> 牌型结算 -> 灾厄 -> 弃牌区更新。
- V1 玩家始终先 Bet，AI 后手；原作首动方交替不实现。
- Bet 采用多轮下注：玩家先动，双方轮流行动；任一方 `check / call / fold` 或 `all-in` 即收敛；raise 增量 ≥ 上次 raise 增量（德州 min-raise），由 Air 与 `totalBetLimit` 自然终止，不设固定轮数上限。
- 下注阶段双方都不知道对方锁定的上层成手。
- 首注规则：场上 Bet 总额为 0 时，`check` 与 `bet` 合法，`raise` 非法（无可加注对象），`fold` 默认禁用（无下注压力，不允许无意义弃牌）。
- 30 秒超时仅在 Bet 阶段玩家回合生效；AI 决策不计时；下层、上层、showdown 阶段不计时。
- 牌型比较中 A 默认按 14（最强）、K = 13、Q = 12、J = 11、2 = 2（最弱）。顺子判定采用德州规则：A-K-Q-J-10 是高 A 顺子；A-2-3-4-5 也是低 A 顺子，比较 Straight / Straight Flush 时最高牌按 5 处理；K-A-2-3-4、Q-K-A-2-3 等跨 A 环绕不算顺子。具体牌型序位见 `04-hand-evaluator.md`。
- 用过牌可选但失效：弃牌区实体牌可出现在候选组合中，但选中后不参与牌型判定、灾厄重叠和本回合弃牌区更新。有效牌数量按降级规则判定（详见 `04-hand-evaluator.md`）。
- 灾厄结算使用订正口径：输家额外扣减自己下注额；输家净亏 = 池子总额；不是 Bet 总额乘二。Bet 总额为 0 时仍可记录触发，但 vanishedAir = 0。
- V1 不实现摊牌阶段微调。进入 Bet 时必须已有玩家锁定成手；若用户未手动暂定，系统在进入 Bet 前使用推荐策略自动锁定一组并提示。
- V1 不恢复刷新前的半局状态。`localStorage` 只保存设置和最近一局摘要（key 规范见 `settings.md`）。
- 固定 seed 回归测试 seed 清单见 harness 4.3，状态机主路径测试 seed A-J 对应 `07-game-state-and-round-flow.md` 的测试要求。

## 测试建设顺序

1. `cards` 与 RNG 单元测试（含固定 seed RNG 可复现性）。
2. 数字牌生成与平衡分配单元测试（含固定 seed 总和关系 364 与差距 ≤ 30）。
3. HandSolver 枚举与用过牌标记单元测试（lowerAvailability / upperSelection 双模式）。
4. HandEvaluator 10 种牌型、A-2-3-4-5 算低 A 顺子、K-A-2-3-4 不算顺子、同牌型比较、有效牌数量降级（5/4/3/2/1/0 张）测试。
5. BettingEngine 合法动作、非法动作、收敛、首注规则、30 秒超时测试。
6. 结算与灾厄账本测试（含订正口径与 Bet = 0 边界）。
7. 状态机主路径、提前结束、决胜回合测试（覆盖 harness 4.3 的 seed A-J）。
8. AI 公平信息边界（编译期类型 + 运行期冻结对象双重检查）与固定 seed 决策可复现测试。
9. UI 主流程轻量 Playwright 冒烟测试（含 axe-core 可访问性 0 violation）。

## 每个功能完成前的门槛

- 核心规则功能：先运行相关 Vitest 文件，再运行 `npm run verify`。
- UI 主流程功能：运行 `npm run verify:full`。
- 完成汇报必须说明修改内容、验证命令、结果和剩余风险。
