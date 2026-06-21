# 04. HandEvaluator 实现设计

## 目标

按原作 Air Poker 牌型序位评价成手，支持同牌型比较，并支持“用过牌可选但失效”导致的有效牌数量降级判定。

## 依赖

- `01-cards-rng-and-deck.md`
- `03-hand-solver.md`

## 建议文件

- `src/domain/hand/hand-ranking.ts`
- `src/domain/hand/hand-evaluator.ts`
- `src/domain/hand/hand-evaluator.test.ts`

错误码统一在 `errors.md` §4 维护。

## 牌型序位

从强到弱（`categoryRank` 越大越强，10 最高，0 最低）：

| 序位 | 牌型 | categoryRank |
| --- | --- | --- |
| 1 | Royal Straight Flush | 10 |
| 2 | Straight Flush | 9 |
| 3 | Four of a Kind | 8 |
| 4 | Full House | 7 |
| 5 | Flush | 6 |
| 6 | Straight | 5 |
| 7 | Three of a Kind | 4 |
| 8 | Two Pair | 3 |
| 9 | One Pair | 2 |
| 10 | High Card | 1 |
| 11 | No Effective Cards | 0 |

`No Effective Cards` 是 V1 为 0 张有效牌增加的最弱结果，不展示为标准扑克牌型。`categoryRank` 数值仅用于排序，UI 不展示。

## A 的口径（V1 钉死）

- 点数求和中 A = 1，由 `Card.pointValue` 提供。
- 牌型比较中 A = 14（最强），2 = 2（最弱）。
- **V1 不实现低 A 顺子**：`A-2-3-4-5` 不判为顺子。唯一允许 A 参与的顺子是 `A-K-Q-J-10`（高 A 顺子），作为 Royal Straight Flush 的识别条件之一。
- **`K-A-2-3-4` 不算顺子**（A 不能同时作高和低）。
- **`2-3-4-5-6` 算顺子**（2 是合法低端）。
- **`Q-K-A-2-3` 不算顺子**（同 K-A-2-3-4，不连续）。

皇家同花顺定义（V1 固定）：

- 5 张同花（同一花色）。
- 5 张 rank pokerValue 集合 = `{14, 13, 12, 11, 10}`（A-K-Q-J-10）。
- 满足皇家同花顺时**不**再判为普通同花顺——这是排他判定，避免牌型比较时出现 Royal SF 和 Straight Flush 都匹配的情况。

## 有效牌数量降级

HandEvaluator 接受的是 `effectiveCards`，不是表面选中的 5 张牌。有效牌数对应规则：

| 有效牌数 | 可达牌型 | 不可达牌型 |
| --- | --- | --- |
| 5 | 全部 10 种标准牌型 | — |
| 4 | 四条、三条、两对、一对、高牌 | Full House、Flush、Straight、Royal SF、Straight Flush（结构上达不到 5 张同花或 5 张连续） |
| 3 | 三条、一对、高牌 | 四条、葫芦、两对、Flush、Straight、Royal SF、Straight Flush |
| 2 | 一对、高牌 | 三条及以上、Flush、Straight、Royal SF、Straight Flush |
| 1 | 高牌 | 任何对子 / 顺子 / 同花 |
| 0 | No Effective Cards | 一切标准牌型 |

同牌型比较时，若牌型相同但有效牌数量不同，有效牌更多者胜。例如 5 张高牌胜 4 张高牌，5 张一对胜 2 张一对。`compareEvaluatedHands` 详见下文。

## 核心类型

```ts
type HandCategory =
  | "RoyalStraightFlush"
  | "StraightFlush"
  | "FourOfAKind"
  | "FullHouse"
  | "Flush"
  | "Straight"
  | "ThreeOfAKind"
  | "TwoPair"
  | "OnePair"
  | "HighCard"
  | "NoEffectiveCards"

type EvaluatedHand = {
  category: HandCategory
  categoryRank: number                  // 0..10，见上表
  effectiveCardCount: number            // 0..5
  tiebreakers: number[]                 // pokerValue 降序数组，长度按牌型定
  label: string                         // UI 展示文本（中文），不参与逻辑
  cardsByRank?: Array<{ rank: number, cards: Card[] }>  // 调试字段
}

type HandCompareResult = -1 | 0 | 1
```

`categoryRank` 越大越强（10 > 0）。`tiebreakers` 长度按牌型定：

- Flush：5（5 张牌 pokerValue 降序）。
- Straight：1（最高牌 pokerValue；高 A 顺子 = 14）。
- Royal Straight Flush：0（与 Straight Flush 同牌型时已用 categoryRank 区分；不进入 tiebreakers 比较）。
- Four of a Kind：2（四条点数 + 剩余高牌）。
- Full House：2（三条点数 + 对子点数）。
- Three of a Kind：3（三条点数 + 剩余 2 张高牌降序）。
- Two Pair：3（高对子 + 低对子 + 剩余高牌）。
- One Pair：4（对子点数 + 剩余 3 张高牌降序）。
- High Card：N（所有有效牌 pokerValue 降序）。
- No Effective Cards：0（无 tiebreaker）。

## 详细 API 契约

### `evaluateHand(effectiveCards): EvaluatedHand`

作用：评价一组有效实体牌的牌型。

参数：

- `effectiveCards`: 0 到 5 张有效牌。必须是同一回合 selected hand 去掉失效用过牌后的结果。

返回：

- `category`: 牌型类别。
- `categoryRank`: 数字越大越强。
- `effectiveCardCount`: 有效牌数量。
- `tiebreakers`: 同牌型比较数组。
- `label`: UI 展示文本。
- `cardsByRank`: 可选调试字段，记录 rank 分组。

失败方式：

- 超过 5 张时抛出 `too-many-effective-cards`。
- 出现重复实体牌 ID 时抛出 `duplicate-card-in-hand`。

调用方：

- 上层候选组合排序。
- UpperAI 评分。
- 摊牌结算。
- 结果页展示。

### `compareEvaluatedHands(left, right): HandCompareResult`

作用：比较两组已经评价过的成手。

参数：

- `left`: 左侧评价结果。
- `right`: 右侧评价结果。

返回：

- `1`: left 胜。
- `0`: 完全相同。
- `-1`: right 胜。

比较顺序（V1 钉死）：

1. `categoryRank`：大者胜。
2. `categoryRank` 相同时比 `effectiveCardCount`：多者胜（同牌型 5 张 vs 4 张 → 5 张胜）。
3. `effectiveCardCount` 也相同时按 `tiebreakers` 逐位比较：第一个不同位置大者胜。
4. `tiebreakers` 完全相同时进入"完全相同"判定（见下）。
5. 仍相同返回 `0`。

**完全相同判定**（步骤 4 → 0 之间的中间层，仅在 0 张有效时可能触发）：

- `effectiveCardCount === 0` 时双方都没有实体牌，categoryRank 均为 0，tiebreakers 为空数组，步骤 1-3 必然全等，按步骤 5 返回 `0`。
- `effectiveCardCount > 0` 时 `tiebreakers` 完全相同意味着所有有效牌 pokerValue 序列一致；V1 视这种情况为"完全相同"返回 `0`（由 `06-round-resolution-and-calamity.md` 决定退还下注 + ante）。
- 实现层不强制要求 5 张 ID 完全相同：例如 Flush 8-7-6-5-3 vs Flush 8-7-6-5-4，categoryRank 都是 Flush、effectiveCardCount 都是 5、tiebreakers [8,7,6,5,3] vs [8,7,6,5,4]，步骤 3 比较出 4 > 3 → right 胜。

### `compareHands(leftCards, rightCards): HandCompareResult`

作用：便捷函数，直接评价并比较两组有效牌。

参数：

- `leftCards`: 左侧有效牌。
- `rightCards`: 右侧有效牌。

返回：

- 与 `compareEvaluatedHands` 相同。

调用方：

- 测试。
- 结算模块可用，但生产代码更推荐显式保存 `EvaluatedHand` 便于展示。

### `rankSolvedHands(hands): RankedSolvedHand[]`

作用：对 HandSolver 输出的候选组合按牌型强弱排序。

参数：

- `hands`: `SolvedHand[]`。

返回：

- 每项包含原 `SolvedHand`、`EvaluatedHand` 和排名。
- 排序从强到弱。
- 同强时保持输入顺序，保证 UI 稳定。

### `getHandCategoryBaseScore(category): number`

作用：返回 AI 评分使用的牌型基础分。

参数：

- `category`: 牌型类别。

返回：

- High Card 100。
- One Pair 200。
- Two Pair 300。
- Three of a Kind 400。
- Straight 500。
- Flush 600。
- Full House 700。
- Four of a Kind 800。
- Straight Flush 900。
- Royal Straight Flush 1000。
- No Effective Cards 0。

用途：

- LowerAI。
- UpperAI。
- 调试 UI 展示 AI 评分细节。

## 标准 5 张判定顺序

1. **先判 Royal Straight Flush**（5 张同花 + rank pokerValue 集合 = `{14,13,12,11,10}`）→ 直接返回 Royal SF，**不**再判 Straight Flush。
2. **再判 Straight Flush**（5 张同花 + 5 张连续）→ 返回 Straight Flush。
3. **再判 Four of a Kind**（4 张同 rank）→ 返回四条。
4. **再判 Full House**（3+2）→ 返回葫芦。
5. **再判 Flush**（5 张同花）→ 返回同花。
6. **再判 Straight**（5 张连续；高 A 顺子 = A-K-Q-J-10；不判 A-2-3-4-5）→ 返回顺子。
7. **再判 Three of a Kind**（3 张同 rank）→ 返回三条。
8. **再判 Two Pair**（两个对子）→ 返回两对。
9. **再判 One Pair**（一个对子）→ 返回一对。
10. 剩余 → High Card。

排他性：步骤 1 一旦匹配皇家同花顺，**不会**再被步骤 2 判为同花顺。步骤 2 一旦匹配同花顺，**不会**再被步骤 5 判为同花。其他步骤的牌型结构互斥，重复不发生。

`No Effective Cards` 在 `effectiveCardCount === 0` 时直接返回，跳过上述所有步骤。

## 降级判定 tiebreaker

按 `effectiveCardCount` 数量分别处理。`tiebreakers` 全部是 `pokerValue` 降序。

| effectiveCardCount | 牌型 | tiebreakers 规则 |
| --- | --- | --- |
| 5 | 全部 10 种 | 见核心类型段 |
| 4 | Four of a Kind | `[四条点数, 剩余高牌]`（长度 2） |
| 4 | Three of a Kind | `[三条点数, 剩余高牌]`（长度 2） |
| 4 | Two Pair | `[高对子点数, 低对子点数]`（长度 2；4 张中两对 + 没有剩余） |
| 4 | One Pair | `[对子点数, 剩余 2 张高牌降序]`（长度 3） |
| 4 | High Card | `[4 张高牌降序]`（长度 4） |
| 3 | Three of a Kind | `[三条点数]`（长度 1） |
| 3 | One Pair | `[对子点数, 剩余高牌]`（长度 2） |
| 3 | High Card | `[3 张高牌降序]`（长度 3） |
| 2 | One Pair | `[对子点数]`（长度 1） |
| 2 | High Card | `[2 张高牌降序]`（长度 2） |
| 1 | High Card | `[1 张高牌]`（长度 1） |
| 0 | No Effective Cards | `[]` |

4 张没有 Full House / Flush / Straight / Royal SF / Straight Flush（结构上达不到）；3 张没有 Four of a Kind / Full House / Two Pair / Flush / Straight / Royal SF / Straight Flush；2 张没有对子以上牌型。这些不可达分支不写 tiebreaker，实现时若误判到这些分支视为开发错误（测试拦截）。

## 测试要求

- 覆盖 10 种标准牌型。
- Royal Straight Flush 强于 Straight Flush（A-K-Q-J-10 同花 vs 9-8-7-6-5 同花）。
- A/K/Q/J/10 同花识别为 Royal Straight Flush。
- A-2-3-4-5 不识别为顺子（按 `High Card` 处理）。
- K-A-2-3-4 不识别为顺子。
- 2-3-4-5-6 识别为顺子（`pokerValue` 集合 `{2,3,4,5,6}`，最高 6）。
- 同牌型按 tiebreaker 比较（含 Flush 5 张降序、Straight 最高牌等子项）。
- 4 张有效牌可判四条、三条、两对、一对、高牌；**不可**误判为 Full House / Flush / Straight。
- 3 张有效牌可判三条、一对、高牌。
- 2 张有效牌可判一对、高牌。
- 1 张有效牌为高牌。
- 0 张有效牌为 `NoEffectiveCards`，`categoryRank = 0`，`compareEvaluatedHands` 与任意非 0 张结果比较时必输。
- 同牌型时有效牌数量更多者胜（5 张高牌 vs 4 张高牌 → 5 张胜）。
- Royal SF 与 Straight Flush 不重复判定：A-K-Q-J-10 同花只判为 Royal SF，不进入 Straight Flush 分支。
- Flush 与 Straight 不重复判定：5 张连续同花按 Royal SF / Straight Flush / Flush 顺序优先，不进入 Straight 分支。
- `categoryRank` 数值与 `errors.md` 不相关，UI 不展示；测试断言只比较 `category` 字段。

## 实现注意

- 不要在 evaluator 内处理点数和是否等于目标值；那是 HandSolver 的职责。
- 不要让 UI 根据 label 判断胜负；胜负只能通过结构化 compare 函数得到。
- `label` 只是展示文本，不能作为逻辑分支依据。
