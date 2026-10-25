# 架构与规则边界

## 当前系统

浏览器直接通过 HTTP 加载 ES modules，无编译步骤与后端。开发工具和测试使用 Node.js；Acorn 与 Prettier 仅为开发依赖，不进入站点。

依赖流：app → browser 时钟 / ui / engine；engine → cards / deal / ai / rules / betting / breathing / records；app → archive → records。实体牌与候选属于 cards，时间与资金的权威变化属于 engine 及纯函数，浏览器时钟只提交动作。

完整可执行矩阵位于 scripts/harness/config.js 的 LAYERS：

| 层                                       | 允许依赖                                            |
| ---------------------------------------- | --------------------------------------------------- |
| data、rules、betting、breathing、records | 无运行模块依赖                                      |
| archive（browser/record-store.js）       | records；只负责归档平台读写                         |
| browser（时钟模块）                      | 无运行模块依赖，负责平台调度                        |
| cards                                    | data、rules                                         |
| deal                                     | cards                                               |
| ai-planning                              | cards、deal                                         |
| ai-betting                               | cards、deal、rules、ai-planning                     |
| ai                                       | ai-planning、ai-betting                             |
| engine                                   | rules、cards、deal、ai、betting、breathing、records |
| i18n                                     | 无运行模块依赖                                      |
| ui                                       | ui、data、rules、cards、engine、breathing、i18n     |
| app                                      | engine、browser、archive、ui、i18n                  |

ui 只消费快照和只读函数，不创建第二份对局状态或自行下注结算。计时器、事件与语言存储属于入口层；game 不使用 DOM、网络、平台时钟或存储。新增模块要明确职责并更新矩阵与说明。

检查器解析静态 import、re-export 与字面量动态 import；拒绝计算模块路径。游戏层禁止的 API 名称在配置中维护。此检查不能替代完整类型系统或安全审计。

## 状态与动作

createGame({ random = Math.random, dealRandom = random, opponent, swapSides = false, recordId = 'local' } = {}) 持有私有状态。默认策略来自 ai；整局评估可注入 choosePlay / chooseBet、独立发牌随机源与交换持牌。策略只接收白名单信息的副本，返回成手亦复制；这些入口不增加界面私有数据。默认发牌、规则和记录格式保持兼容：

- getState() 返回深拷贝快照，隐藏对手未出数字、来源证明及摊牌前成手。
- getRecord() 按需深拷贝完整事件、轮次、逐笔账目和派生统计；进行中隐藏未揭示尝试的对手成手，不包含未来对手数字。recordId 由浏览器生成，session 后缀区分重开。getState() 的 accounting 只保留当前五账户摘要，不每次复制完整历史。
- dispatch(action) 接受当前阶段合法动作，成功返回 true；拒绝的动作返回 false，状态不变。数组形式的无效成手提交是合法游戏动作，会记录成手失败；错误请求类型则被拒绝。
- reset() 开新局，sessionId、attemptId 和 turnId 跨重开递增；入口同时清理计时器和视图。

正常流程：lower → upper → bet → showdown → lower；五轮完成或不能继续匹配底注时，showdown → endurance → summary。双方成手失败时，bet → upper 重做同数字与同底池，upper 确认后直接重新比较；若双方数学无解，则退回底池进入 endurance。任意活动阶段都可能因供气及缺氧宽限结束进入 summary。

上层的 confirm-hand、submit-hand、fail-hand、upper-timeout 必须带当前 attemptId。下注、对手与下注超时必须带当前 turnId。动作编号阻止旧按钮和回调重复扣款。

时间动作 elapse 带 sessionId 和递增、安全整数 elapsedMs。引擎依次推进到供气边界、60 秒构造截止或下注行动截止；一次长时间恢复与分步推进结果相同。五轮后的 fast-forward 只在 endurance、session 匹配时生效，复用同一供气公式到首次死亡。

browser/match-clock.js 用单调时钟同步绝对时长；browser/turn-clock.js 展示引擎截止时间并调度玩家 30 秒 / 对手 600ms / 构造 60 秒。app 在交互前先同步时间；pageshow 先恢复呼吸再恢复行动。普通呼吸脉冲只更新文字，避免丢失加注输入；阶段、行动或整罐余额变化才重绘。语言与只读查看不重置对局、截止时间或呼吸。

browser/visit-counter.js 归 browser 层，无运行模块依赖；只在公网 HTTPS 下按模块所在部署根目录加载一次 Hits 计数图片，不加载远程脚本，不读取或上传对局状态。计数 footer 在页面模板之外持久保留，由 ui/render.js 控制首页显隐和翻译；重复渲染、语言切换与后台恢复不重新计数。图片失败或 8 秒超时仅降级统计展示，非 bfcache 的 pagehide 清理尚未完成的监听与计时器；进入页面缓存时保留原图片请求与回调，返回后可继续完成，不重设 src。

## 当前玩法事实

- 每方总资源 25 罐，开局自动打开 1 罐，未开余额 24。每罐近似 300 秒，耗尽自动开下一罐；已开罐不可下注，累计计入 breathSpent，不按回合扣费。
- 未开余额为零仍使用当前供气；无供气后固定 10 秒缺氧宽限。按实际存活确定 winner，同刻死亡平局。enduranceReason 记录 round-limit、no-betting-air 或 upper-deadlock；endReason 的 breath-exhausted 表示已完成生存判定。
- 双方独立持有五张数字牌，不补牌；相同数值按不同位置计数。deal 用十组证明成手生成数字并平衡总和，来源证明不预留共享实体牌。
- 对手在玩家选择前，仅凭自己的未用数字与公共弃牌，综合当前牌力、移除成手后剩余数字的可解性与牌力锁定成手，评分相同随机；无解时仍使用自己的数字并记为失败。下注只读自身私牌与公开信息，基于至多十二个公开目标候选的加权模型、底池回款与重叠失败损失比较动作；不能按玩家隐藏成手反选。模型不是实际胜率，前瞻不保证对手弃牌后仍有解。
- 界面每个目标至多三个不同实体组合。makeCandidates 的第三参数可指定 1–24 的受限预算，默认 3，正式策略查询 12；候选完整五张、无重复、不含弃牌，支持 6–64；求解器枚举点数多重集和同花方案，首选牌型最强，花色方案不是全部策略枚举。
- A 求和为 1，J/Q/K 为 11/12/13；比较通常 A 高，A2345 为五高，踢脚逐项比较。judgeHand 校验真实牌定义、重复、已用及点数和，拒绝伪造字段。
- 未用数字始终可选，targetSolvable 仅表示能否成手。主动失败或构造超时保留实体牌；单方失败输实际底池，无灾厄。双方失败不重复底注、下注或 completedRounds；双无解退回投入转耐息是本版约定。
- 同轮可以实体重叠；只有有效成手并集进入公共弃牌。下层弃牌也消耗已锁定的有效成手，但不追加灾厄。
- 底注递增至回合数，按双方可匹配资源封顶，无边池。交替行动，无压力过牌，有压力跟注；跟注后继续，连续两次过牌或全押匹配结束；弃牌立即结算。
- 加注增量 1 至 min(floor((底池+应跟额)/2), 可匹配总额−当前高投入)，付款为应跟额+增量，全押不能绕过此上限。首轮小数字先动，同数随机；后续交替。
- 呼吸减少可匹配资源时，退回过高的未匹配投入并重新计算应跟额；呼吸罐不进入底池。死亡时退回尚未结算的投入，冻结实际死亡结果。
- 普通结算守恒，灾厄仅损失实际 burned。账目核对未开余额 + 底池 + breathSpent + 累计 burned = 50。
- completedRounds 仅在真正结算后递增；双方重做与双无解未结算轮不计入。五轮后耐息期间不补数字、不增加下注回合。

行为与数字版边界见 [当前规则](../rules/current.md)，二手来源及历史差异见 [核对报告](../rules/audit.md)。历史页面提案不是默认需求，当前不能称为原作 1:1 复刻。

## 记录与归档边界

engine 在已接受动作和实际资金写入点通知 records。事件 id 单调递增，使用对局 elapsedMs；轮外呼吸与耐息归为 round=null。ledger 以同一 id 关联空气转移，保存 from/to/amount/reason 和 before/after 五账户，能够连续重放到实际状态。长时间快进按真实开罐时刻拆笔，不依赖浏览器脉冲频率。

rounds 保留目标、先动方、每次成手及失败原因、下注、结算牌型与踢脚向量、实际收款和 burned、前后余额与弃牌。双方失败增加尝试，数学无解轮为 void，耗尽时未结束轮为 interrupted；只有 settled 计入完成数。

app 在每个 session 首次进入 summary 时保存一次完整记录。archive 只读写 air-poker-last-record-v1，检查版本、基本结构和连续账目，重算派生统计；失败返回状态，不阻断游戏。新局不会覆盖此前完成局，下一局完成才替换。此机制不提供对局恢复、导入执行或防篡改认证。

ui/record.js 只渲染快照与翻译，外来字符串转义。查看和导出使用打开时快照，不暂停计时；刷新按钮主动读取最新状态。导出通过浏览器 Blob 下载 JSON，保存失败时仍可导出内存记录。

## 发布与资源

`npm run build` 只替换固定输出目录 `dist/site/`，从配置白名单复制入口、JS、CSS 和 `assets/generated/`。不复制开发依赖、测试、脚本、设计提案或参考素材。没有压缩、打包或代码转换。

浏览器导入与本地资源使用相对路径，以兼容根路径和项目子路径。新增运行目录时同步核对以下三处：

1. `scripts/harness/config.js` 中的发布与代码检查范围。
2. `scripts/serve.js` 中本地开发服务的公开路径。
3. 真实浏览器的加载行为，以及资源递归检查是否覆盖新的引用方式。

资源检查覆盖当前 HTML `src/href/poster`、CSS `url/@import`、JS 模块导入和静态图片/字体字符串。新增 `srcset`、动态拼接资源路径或其他加载方式时，先扩展检查器并补反例测试，不能假设已有检查全部覆盖。

## 漫画界面与表现层

ui/hand-builder.js 持有纯视图草稿操作，按 sessionId 和 attemptId 隔离，使用 cards 的标准牌库和 judgeHand 展示预校验；它不写入引擎状态。app 确认时通过 submit-hand 提交，所有卡牌、筛选、推荐操作在同步时钟后校验 attemptId。

ui/render.js 组合 pages、battle、tutorial 模板并维护渲染焦点；battle 读取 breathing 常量显示真实供气进度，不调用结算。教学只持有练习视图状态，独立于正式 createGame。ui/review.js 只消费 getRecord 快照，事件播放按记录序号展示，不重新运行 AI。

browser/scene-motion.js 无运行模块依赖，从前后公开快照识别已接受动作，用真实 betting.history.paid 区分支付与呼吸开罐。表现副本不带可交互入口；动画结束不触发任何引擎动作。统一 Canvas 限制像素倍率、隐藏暂停绘制、尊重系统和用户偏好，恢复不补播过时事件。

app.js 继续负责事件委托、对话框、实际时钟、教学状态、复盘播放与偏好存储。页面离开清理时钟，规则和记录保持只读且不中断对局；未完成局离开需确认，未创建新的游戏恢复能力。

## 发牌与策略评估

npm run evaluate:strategy 默认使用 100 个独立种子、每个交换持牌，对比仅选牌、仅下注、完整策略和冻结旧版；--mode baseline 跑旧版基准。模拟复用引擎直到实际耐息终局，每次动作核对账户，完成记录经 isCompletedRecord 验证。参数、指标、独立样本、耗时与发牌决策见 [策略实施记录](../rules/strategy/results.md)。
