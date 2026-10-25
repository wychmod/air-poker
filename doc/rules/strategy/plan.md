# 发牌与对手策略 Plan

## 架构

引擎增加可选的独立发牌随机源、交换持牌与策略注入，仅将白名单信息的副本传给策略。默认使用改进策略；脚本注入冻结旧策略，避免基准随实现变化。

选牌和下注分别放入 game/ai-planning.js、game/ai-betting.js，由 game/ai.js 保持原接口转发。cards 的候选求解允许显式计算预算，界面默认仍返回三个；策略使用有限更大候选集。新层显式登记，不能访问平台 API。

选牌以当前完整牌型强度与移除成手后所有剩余数字的可解性、最强牌力评分，局部缓存按弃牌集合与目标区分。只评估己方可见资源；不能保证对方出牌后仍有解。

下注对公开目标的有限合法候选加权，估计赢、平、输以及重叠后失败概率。基于增量下注成本、底池回款和实际可烧储备比较跟注与加注；加注仍通过引擎校验。有限候选分布是策略假设。

## 工具与评估

scripts/strategy/legacy.js 冻结原算法；scripts/strategy/simulate.js 使用 createGame 的 dispatch 到真实终局，分别传入对双方合法的信息。scripts/evaluate-strategy.js 输出 JSON 报告至 output/harness，不进入发布产物。固定发牌随机源独立于策略消耗；同一 seed 的两局交换双方数字。

报告包括旧策略基准、仅改选牌、完整新策略对旧/被动/激进策略、同策略换边和发牌统计。用开发样本定位问题，以独立种子验证最终版本，不据单个匹配宣布通用最优。

## 接口

- createGame({ random, dealRandom = random, opponent, swapSides = false, recordId })：opponent 提供 choosePlay、chooseBet；默认为正式策略。
- chooseCpuPlay(targets, usedTargets, discard, random)：返回 { index, target, hand, rank } 或 null。
- chooseCpuBet({ hand, opponentTarget, discard, options, history }, random)：返回合法动作。
- makeCandidates(target, discard, limit = 3)：显式 limit 有上限，默认行为兼容。

## 决策

优先保留现行发牌；只有整局数据支持明确问题才改变规则。记录接口与信息隔离优先于未经验证的胜率提升。
