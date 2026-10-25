# 发牌与对手策略 Tasks

## 执行顺序

1. T1：冻结 game/ai.js 原算法至 scripts/strategy/legacy.js；为 game/engine.js 增加受限策略注入及可复现换边；验证原默认行为。
2. T2：实现 scripts/strategy/simulate.js、scripts/evaluate-strategy.js 和 tests/strategy-simulation.test.js；完整终局、坏动作立即报错、逐步账目守恒和记录验证；保存旧策略基准。
3. T3：调整 game/cards.js 的受限候选预算；实现 game/ai-planning.js，补后续可解性回归与无解输入；登记架构层。
4. T4：实现 game/ai-betting.js，用公开候选、底池和灾厄估算下注；补模型和合法动作测试；game/ai.js 转为正式入口。
5. T5：比较仅改选牌和完整策略，使用独立种子验证，对发牌作出结论；记录性能和局限。
6. T6：更新 AGENTS.md、doc/harness/architecture.md、doc/README.md 和当前规则事实；运行完整检查与浏览器对局，完成验收记录。

## 边界

本轮不改 README 多语言工作。scripts/harness/config.js 已有修改，只追加新模块的精确层级。报告与截图放 output，不提交。

## 完成状态

T1–T6 已按顺序完成；开发样本、独立验证、浏览器与自动校验证据见 results.md 和 checklist.md。旧策略仍作为工具基准保留，正式页面默认使用新版。
