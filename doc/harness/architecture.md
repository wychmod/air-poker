# 架构与规则边界

## 当前系统

浏览器直接通过 HTTP 加载 ES modules，无编译步骤与后端。开发工具和测试使用 Node.js；Acorn 与 Prettier 仅为开发依赖，不进入站点。

```text
app.js --> browser/turn-clock.js（计时与调度）
  ├----> ui/ --> i18n.js / 游戏只读计算
  └----> game/engine.js --> game/deal.js --> game/cards.js --> game/data.js
                  │          ↑                  └--------> game/rules.js
                  └--------> game/ai.js --> cards / deal / rules
                  └--------> game/betting.js（纯下注转换）
```

完整可执行依赖矩阵位于 `scripts/harness/config.js` 的 `LAYERS`：

| 层      | 允许依赖                             |
| ------- | ------------------------------------ |
| data    | 无运行模块依赖                       |
| rules   | 无运行模块依赖                       |
| betting | 无运行模块依赖                       |
| browser | 无运行模块依赖，平台调度             |
| cards   | data、rules                          |
| deal    | cards                                |
| ai      | cards、deal、rules                   |
| engine  | rules、cards、deal、ai、betting      |
| i18n    | 无运行模块依赖                       |
| ui      | ui、data、rules、cards、engine、i18n |
| app     | engine、browser、ui、i18n            |

`ui` 当前从引擎读取初始空气常量；它只消费快照和只读函数，不创建第二份对局状态或自行下注结算。计时、浏览器事件与语言存储属于入口层。添加新的游戏模块需要在矩阵中选择职责层，并同步更新说明和检查用例。

检查器解析静态 import、re-export 与字面量动态 import，不把注释、文案或普通对象属性名误当作平台调用。计算模块路径会被拒绝，以保证可分析与静态托管。游戏层禁止的 API 名称在配置中维护；这是工程边界检查，不能替代完整的静态类型系统或安全审计。

## 状态与动作

`createGame({ random = Math.random } = {})` 持有私有状态，可注入随机源用于可复现测试，对外提供：

- `getState()`：返回深拷贝快照，调用方修改快照不影响牌局；CPU 未出数字、来源证明及摊牌前成手不进入快照。
- `dispatch(action)`：当前阶段动作合法时修改状态并返回 `true`；否则返回 `false` 且状态不变。
- `reset()`：回到初始状态。入口负责同时清理其计时器和显示状态。

```text
lower ──choose-target──> upper ──confirm-hand──> bet
                          │                     │
                   select-candidate        bet(action)
                   recommend-hand               │
                                                v
summary <──advance-round── showdown ──advance-round──> lower
             终局                         可继续
```

页面切换与语言是视图状态，不应通过重建引擎实现。只读查看不触发下注或结算，计时器通过携带 turnId 的正常动作提交超时过牌或弃牌，不能绕过引擎直接更改 AIR。

## 当前玩法事实

- 单人对 CPU，双方初始 25 AIR，最多五回合。开局双方独立持有五张数字牌，用后不补；相同数值按不同位置计数。
- deal 模块以十组五张证明成手生成数字，枚举五对五分配以平衡总和；证明牌仅是开局来源，不从共享库预留。
- CPU 在玩家选择前，仅以自身未用数字和公共弃牌锁定最强推荐，同强时随机。引擎闭包保存该选择，摊牌才写入公开快照。
- 每个目标提供至多三个不同实体组合的推荐；所有候选必须完整五张、无重复实体、不含弃牌，支持点数和 6–64。
- 求解器枚举全部可行点数多重集及其同花方案，确保首选牌型最强；实体花色方案仅是子集，不是完整风险策略枚举。
- 点数求和 A=1、J=11、Q=12、K=13；比较中 A 通常为高牌，A2345 为五高；同牌型逐项比较踢脚牌。
- 双方同轮可以实体重叠；结算后成手并集进入公共弃牌，下一轮不得复用。弃牌动作不追加灾厄惩罚，但仍消耗本轮双方数字和锁定成手。
- 底注随回合数递增。betting 保存 first/turn/turnId/checks/history；合法动作从 getBetOptions 派生，界面读取快照中的 legalBets。
- 双方交替下注，不自动替对方扣款；无压力才能过牌，有压力才能跟注，跟注后继续，连续两次过牌结束。任一方弃牌或全押已匹配直接结算。
- 加注增量 1 至 min(floor((底池+应跟额)/2), 可匹配总额−当前高投入)，实际付款为应跟额+增量；不采用德州最小加注，全押同样受限。
- 首轮小数字先动，同数随机；后续轮流首动。CPU 仅以自己的手牌、公开目标、弃牌和下注历史作启发式选择，不能读取玩家隐藏选择。
- 计时位于 browser/turn-clock.js，按行动保存绝对截止时间；玩家 30 秒，CPU 600ms。app 处理回调和生命周期。turnId 跨 reset 递增；语言、规则查看不续时，后台恢复沿用截止时间。
- 没有边池，投入按双方可匹配空气封顶；进入下一轮双方各扣至多 1 AIR 呼吸成本。累计费用见 breathSpent。
- 普通结算守恒；灾厄仅减少实际 burned；终局按最终 AIR。无合法目标提前结束是数字版约定，不是原作上层失败判例。
- completedRounds 仅在真实结算后递增；endReason 区分 round-limit、air-exhausted 和 no-legal-target。没有真实开始的轮次不计入总结。

行为明细见 [当前规则](../rules/current.md)，原作与历史方案差异见 [核对报告](../rules/audit.md)。
这些是当前实现基线，用户明确要求改变时需要同步修改代码、相关测试与文档。历史文档中的未来玩法不自动成为当前约束。

## 发布与资源

`npm run build` 只替换固定输出目录 `dist/site/`，从配置白名单复制入口、JS、CSS 和 `assets/generated/`。不复制开发依赖、测试、脚本、设计提案或参考素材。没有压缩、打包或代码转换。

浏览器导入与本地资源使用相对路径，以兼容根路径和项目子路径。新增运行目录时同步核对以下三处：

1. `scripts/harness/config.js` 中的发布与代码检查范围。
2. `scripts/serve.js` 中本地开发服务的公开路径。
3. 真实浏览器的加载行为，以及资源递归检查是否覆盖新的引用方式。

资源检查覆盖当前 HTML `src/href/poster`、CSS `url/@import`、JS 模块导入和静态图片/字体字符串。新增 `srcset`、动态拼接资源路径或其他加载方式时，先扩展检查器并补反例测试，不能假设已有检查全部覆盖。
