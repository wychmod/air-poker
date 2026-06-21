# Air Poker V1 AI 开发质量 Harness 设计

日期：2026-06-21  
版本：V1  
适用场景：单人使用 AI 辅助开发前端项目  
关联文档：
- `doc/2026-06-18-air-poker-v1-design.md`
- `doc/2026-06-20-air-poker-v1-user-flow.md`
- `doc/2026-06-21-air-poker-v1-architecture.md`

## 1. 目标

本项目由单人开发，并会大量使用 AI 辅助实现。质量 harness 的目标是建立一套低摩擦、可重复运行、能约束 AI 输出质量的自动检查机制。

这套机制不追求企业级流程，而是解决几个实际问题：
- AI 改代码后不能只靠口头判断。
- 游戏规则复杂，必须有自动化测试兜底。
- 单人开发容易漏跑检查，需要统一验证命令。
- 随机牌局和 AI 决策必须可复现。
- 前端页面必须至少保证主流程能在浏览器中跑通。

## 2. 核心原则

### 2.1 每次完成前必须有验证证据

AI 完成任务前，必须明确说明：
- 修改了哪些文件。
- 运行了哪些验证命令。
- 命令是否通过。
- 如果没有运行某项验证，原因是什么。
- 还剩哪些测试盲区或风险。

不接受只说“应该可以”“看起来没问题”“理论上能跑”。

### 2.2 先保证规则，再保证界面

Air Poker V1 的高风险点主要在规则，而不是 UI 样式。

优先测试：
- 牌库与数字牌生成。
- 成手枚举。
- 牌型比较。
- Bet 约束。
- 灾厄结算。
- 状态机流转。
- AI 公平信息边界。

UI 自动化测试只覆盖关键主流程，不在 V1 阶段过度堆端到端测试。

### 2.3 随机过程必须可复现

所有洗牌、数字牌生成、AI 随机扰动都应通过可注入 RNG 完成。

测试中使用固定 seed。线上运行可以使用随机 seed，但需要能在调试日志或回合记录中看到本局 seed，方便复现问题。

### 2.4 统一入口，降低心智负担

项目需要一个标准验证命令：

```text
npm run verify
```

AI 和开发者都以这个命令作为默认完成前检查。

## 3. 推荐脚本

建议在前端项目初始化后配置以下脚本：

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "format": "prettier . --write",
    "format:check": "prettier . --check",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "e2e": "playwright test",
    "verify": "npm run typecheck && npm run lint && npm run test && npm run build",
    "verify:full": "npm run verify && npm run e2e"
  }
}
```

V1 日常开发默认运行：

```text
npm run verify
```

涉及浏览器主流程、页面交互、下注按钮、摊牌展示、结算页面时运行：

```text
npm run verify:full
```

## 4. Harness 分层

### 4.1 静态质量层

工具：
- TypeScript strict mode
- ESLint
- Prettier

目标：
- 防止类型错误。
- 防止未使用变量、错误 import、明显不安全写法。
- 保持格式一致，避免 AI 生成风格漂移。

最低要求：
- `tsconfig.json` 开启 `strict`。
- ESLint 覆盖 TypeScript 和 React。
- Prettier 只负责格式，不和 ESLint 规则互相抢职责。

### 4.2 规则单元测试层

工具：
- Vitest

测试重点：
- `domain/cards`
- `domain/number-card-generator`
- `domain/hand`（含 solver + evaluator + ranking）
- `domain/betting`
- `domain/calamity`
- `domain/ai`
- `domain/game`

这层是 V1 最重要的质量保障。按模块拆解如下：

#### cards/

- 构建 52 张牌：13 数字 × 4 花色 = 52，无重复 ID。
- 点数映射：A=1, J=11, Q=12, K=13，其他数字为本身。
- 牌 ID 稳定（如 `S-A`、`H-10`）。
- 洗牌后仍 52 张不重复。
- 弃牌区操作：add / remove / query。
- 共享牌库更新：移除已用牌后剩余数量正确。
- 用过牌可选：枚举时允许返回含弃牌区用过牌组合并标记「已用过」。

#### number-card-generator/

- 抽 2 张 burnCards。
- 切 10 组每组 5 张，每组点数和 = 1 张数字牌。
- 总和关系：玩家 + AI + burnCards = 364。
- 双方差距 > 30 重新生成。
- proofHand 保存：每张数字牌的 5 张实体牌记录正确。
- 不可解数字牌返回 0 个组合。

#### hand/

- `HandSolver` 只返回 5 张牌。
- `HandSolver` 返回组合点数和必须等于目标值。
- `HandSolver` 允许返回包含弃牌区用过牌的组合，且每张牌正确标记「未用过 / 已用过」状态。
- `HandSolver` 枚举时考虑当前共享牌库 + 弃牌区。
- 大量组合性能可接受（C(50,5) ≈ 2M，V1 不要求实时）。
- `HandEvaluator` 覆盖 10 种牌型：皇家同花顺、同花顺、四条、葫芦、同花、顺子、三条、两对、一对、高牌。
- `HandEvaluator` 正确处理原作牌型序位（A 最强）。
- 同牌型比较有确定结果。
- **降级判定**：4/3/2/1 张有效牌的牌型判定。
- **0 张有效牌判负**。
- 5 张 vs 4 张的同牌型：5 张胜。

#### betting/

- 合法动作生成：check / call / raise / fold / all-in。
- 非法动作拒绝（Air 不足、raise 超上限等）。
- **Raise 上限**：增量 ≤ 场上 Bet 总额 1/2。
- **总 Bet 上限**：≤ 双方剩余可下注 Air 较少者。
- **Fold 后胜负结算**。
- **收敛**：玩家 → AI → 玩家再响应 → 结束（不允许无限循环）。
- **30 秒超时**：自动 check / call / fold。
- 玩家可选弃牌区用过牌后该轮 raise 仍合法（用过牌不影响下注逻辑）。

#### calamity/

- 触发条件：双方成手存在实体牌重叠。
- **仅比较有效牌的重叠**（用过失效牌不参与）。
- **正常 Bet 结算**：胜者拿对手下注额。
- **灾厄额外扣减**：输家扣自己下注（消失到水中）。
- **输家净亏 = 池子总额**（不是 ×2）。
- 触发但 Bet 总额 = 0：仍记录触发，不造成 Air 变化。
- Fold 后触发灾厄：按双方锁定成手判定，弃牌方为输家。

#### ai/

- LowerAI / UpperAI / BettingAI 决策均可解释（返回评分明细）。
- AI **不能读取玩家隐藏成手**（编译期 + 运行期双重检查）。
- AI **输入是显式对象**（不传整个 GameState）。
- 评分公式各项具体值符合 design 8.2 表格（牌型分 100-1000、空气压力修正区间、回合阶段修正区间、灾厄风险 0-100 等）。
- **All-in 五重约束**（详见 design 8.2）：
  - 置信度门槛 ≥ 0.92。
  - 空气余量 ≥ 5。
  - 至少 R2 及之后。
  - 一局最多 2 次 All-in。
  - 上一次 All-in 后隔 1 回合才能再次。
- All-in 约束不通过时降级为 raise（不是直接跳过）。
- 用户可玩性原则：一局 5 回合中 AI All-in ≤ 2 次。

#### game/

- 状态机主路径：从 idle 跑到 gameOver。
- **5 回合打满 + 提前结束 + 决胜回合**都覆盖。
- 5 回合结束 Air 相同 → 比较累计底池。
- 累计底池也相同 → 决胜回合（按 R5 计费）。
- 决胜回合后仍平局 → 判平局。
- 牌库耗尽 → 提前结算。
- 双方数字牌全不可解 → 补牌重算。
- 一方支付呼吸/参加费失败 → 立即失败处理。
- 双方同时不足参加费 → 平局处理。
- 平手牌型按高牌细则比较 → 完全相同退还下注。

### 4.3 固定种子回归层

工具：
- Vitest
- 可注入 RNG

目标：
- 把随机牌局变成可复现测试。
- 避免 AI 或洗牌相关 bug 难以复盘。

建议建立固定 seed 用例：

| seed | 场景 |
|------|------|
| seed A | 正常 5 回合 |
| seed B | 早期触发灾厄（双方下注后重叠） |
| seed C | 一方 Air 提前归零 |
| seed D | AI raise 后玩家二次响应 |
| seed E | 触发补牌重算（数字牌全不可解） |
| seed F | 5 回合平局进入决胜回合 |
| seed G | 决胜回合后仍平局（边界） |
| seed H | 玩家选用过牌触发降级判定 |
| seed I | 玩家 5 张全用过 → 0 张有效判负 |
| seed J | Fold 后触发灾厄（按锁定成手判定） |

每个 seed 测试不必验证所有 UI 细节，只验证关键状态：
- 游戏没有卡死。
- 阶段流转合法。
- Air 不出现非法值。
- 牌库和弃牌区没有重复实体牌。
- 最终能进入 `gameOver` 或合法的提前结算。
- 灾厄触发时输家净亏 = 池子总额（不是 ×2）。
- All-in 触发时满足五重约束。

### 4.4 浏览器冒烟测试层

工具：
- Playwright

目标：
- 验证真实浏览器中能打开页面。
- 验证主流程按钮可点。
- 验证用户能完成一局关键路径。

V1 推荐只写少量高价值用例：
- 页面能加载并显示开始新局。
- 点击开始新局后显示玩家 Air、AI Air、数字牌。
- 玩家能选择可解数字牌。
- 玩家能暂定或推荐成手。
- 玩家能进入 Bet 阶段并执行一个合法动作。
- 摊牌后能看到双方成手和回合结果。
- 能进入下一回合或游戏结束页。

不建议 V1 一开始做大量视觉快照测试。规则还在调整时，视觉快照容易产生维护成本。

### 4.5 构建与部署层

工具：
- Vite build
- 静态部署平台

目标：
- 每次提交前确认项目能构建。
- 防止 TypeScript 或资源路径问题在部署阶段才暴露。

最低要求：
- `npm run build` 必须包含在 `npm run verify` 中。
- 部署前运行 `npm run verify:full`。

## 5. AI 开发工作流

每个开发任务建议按以下流程执行：

```text
1. 写清楚任务目标和验收标准
2. 确认涉及的模块边界
3. 先补充或更新相关测试
4. 实现代码
5. 运行最小相关测试
6. 运行 npm run verify
7. 如果涉及浏览器流程，运行 npm run verify:full
8. 汇报修改内容、验证命令、剩余风险
```

AI 的最终汇报模板：

```text
本次修改：
- ...

验证：
- npm run test -- ...
- npm run verify

结果：
- ...

未覆盖风险：
- ...
```

如果验证失败，AI 必须继续修复，不能把失败状态包装成完成。

## 6. 任务验收标准模板

每个功能开始前，建议先写 3 到 7 条验收标准。

示例：

```text
功能：实现灾厄结算

验收标准：
- 双方成手存在相同实体牌时触发灾厄。
- 灾厄只惩罚本回合输家。
- 输家额外损失 Bet 总额。
- 额外损失的 Air 不归属胜者。
- Fold 后仍按双方锁定成手判断灾厄。
- 有单元测试覆盖普通胜负、fold、Bet 为 0 三种情况。
```

验收标准应该能直接转成测试用例。写不成测试的标准，通常说明表达还不够清楚。

## 7. Git 与 CI 建议

### 7.1 本地提交前

提交前至少运行：

```text
npm run verify
```

涉及 UI 主流程时运行：

```text
npm run verify:full
```

### 7.2 GitHub Actions

建议在项目有代码后增加 CI：

```yaml
name: Verify

on:
  pull_request:
  push:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run verify
```

如果加入 Playwright，再增加浏览器安装和 e2e：

```yaml
      - run: npx playwright install --with-deps
      - run: npm run e2e
```

## 8. 代码组织约束

为了让 harness 有效，代码结构需要配合：

- `domain/` 只放纯规则逻辑，不依赖 React。
- `domain/` 不直接访问 `window`、`document`、`localStorage`。
- 随机数通过参数传入，不在规则函数内部直接调用 `Math.random()`。
- UI 组件只派发 action，不直接修改复杂游戏状态。
- AI 决策输入必须是显式对象，不能传入完整 `GameState` 后随意读取隐藏字段。
- 复杂规则函数返回可解释结果，而不是只返回布尔值。

示例：

```text
BettingAI 输入：
- 自己锁定成手
- 玩家公开目标值
- 玩家可能成手集合摘要
- 双方 Air
- 当前 Bet 状态

BettingAI 不应输入：
- 玩家已暂定的隐藏成手
```

## 9. 推荐建设顺序

V1 项目初始化后，建议按以下顺序建设 harness：

1. TypeScript strict + Vite build。
2. ESLint + Prettier。
3. Vitest。
4. `npm run verify`。
5. 牌库、数字牌、HandEvaluator 的第一批单元测试。
6. 固定 seed RNG。
7. 状态机主路径测试。
8. Playwright 冒烟测试。
9. GitHub Actions。
10. 覆盖率报告。

覆盖率不是第一优先级。早期更重要的是关键规则测试是否覆盖到了真实风险。

## 10. 质量门槛

V1 开发期间建议采用以下门槛：

日常任务完成：

```text
npm run verify
```

涉及核心规则：

```text
npm run test -- <相关测试文件>
npm run verify
```

涉及 UI 主流程：

```text
npm run verify:full
```

准备部署：

```text
npm run verify:full
```

如果项目暂时还没有 e2e 测试，则部署前至少手动跑一遍完整牌局，并在记录中说明。

## 11. 结论

Air Poker V1 的质量 harness 应以规则测试为核心，以统一验证命令为完成门槛。

推荐组合：

```text
TypeScript strict
+ ESLint
+ Prettier
+ Vitest domain tests
+ seeded RNG regression tests
+ Playwright smoke tests
+ npm run verify
+ GitHub Actions
```

这套方案足够支撑单人使用 AI 开发前端项目，同时保持实现和维护成本可控。

## 12. 修订记录

- **2026-06-21**：4.2 规则单元测试层按模块细化（cards / number-card-generator / hand / betting / calamity / ai / game），4.3 固定种子回归层新增 seed F-J 用例（决胜回合 / 平局 / 用过牌失效 / 0张有效 / Fold 后灾厄）。同步细化灾厄结算、All-in 五重约束、降级判定等测试要点。
