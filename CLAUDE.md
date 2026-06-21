# Air Poker Claude Instructions

本文件是 Claude Code 进入本仓库后的默认工作规则。开始任何开发任务前，先阅读：

- `doc/2026-06-21-air-poker-v1-ai-development-quality-harness.md`
- `doc/2026-06-21-air-poker-v1-architecture.md`
- 与任务相关的设计或用户流程文档

## 项目定位

Air Poker V1 是纯前端单机游戏，技术栈是 TypeScript + React + Vite + Vitest。V1 不做账号、后端、联机、数据库或云存档。

## 代码边界

- `src/domain/` 只放纯游戏规则，不依赖 React、DOM、`window`、`document` 或 `localStorage`。
- `src/app/` 放浏览器侧编排，例如设置、持久化、RNG 注入和适配器。
- `src/ui/` 放 React 展示和交互，把用户动作转换成 domain action。
- `src/tests/` 放 Vitest setup 和共享测试工具。
- 随机过程必须可复现：洗牌、数字牌生成、AI 扰动都通过可注入 RNG 完成。
- AI 决策输入必须是显式对象，不能传入完整 `GameState` 后随意读取隐藏字段。

## 开发流程

每个任务按以下顺序执行：

1. 明确任务目标和验收标准。
2. 确认涉及的模块边界。
3. 先补充或更新相关测试。
4. 实现代码。
5. 运行最小相关测试。
6. 运行 `npm run verify`。
7. 涉及浏览器主流程时运行 `npm run verify:full`。
8. 汇报修改内容、验证命令、结果和剩余风险。

验证失败时继续修复，不要把失败状态包装成完成。

## 质量门禁

- 日常任务完成前必须运行 `npm run verify`。
- 涉及核心规则时，先运行相关测试文件，再运行 `npm run verify`。
- 涉及 UI 主流程、按钮、摊牌、结算页或浏览器交互时，运行 `npm run verify:full`。
- 准备部署前运行 `npm run verify:full`。
- 如果暂时没有 e2e 测试，部署前至少手动跑一遍完整牌局，并在记录中说明。

## 测试重点

规则测试优先于 UI 测试。优先覆盖：

- 牌库与数字牌生成。
- 成手枚举。
- 牌型比较与有效牌数量降级判定。
- Bet 合法动作、Raise 上限、总 Bet 上限和 Fold 结算。
- 灾厄触发、有效牌重叠和 Air 差额消失。
- 状态机主路径、提前结束、决胜回合和平局。
- 固定 seed 回归。
- AI 公平信息边界。

## 最终汇报格式

最终回复必须包含：

- 本次修改。
- 运行过的验证命令。
- 验证结果。
- 未覆盖风险或未运行项目及原因。

不要使用“应该可以”“看起来没问题”“理论上能跑”代替验证结果。
