# 01. Cards、RNG 与 Deck 实现设计

## 目标

建立全项目最底层的实体牌模型、牌值口径、牌库操作和可复现随机源。后续数字牌生成、成手枚举、牌型比较、灾厄和弃牌区都依赖这一层。

## 建议文件

- `src/domain/cards/card.ts`
- `src/domain/cards/deck.ts`
- `src/domain/cards/deck-state.ts`
- `src/app/rng.ts`（实现归属见 `09-app-services.md`）
- `src/domain/cards/card.test.ts`
- `src/domain/cards/deck.test.ts`

错误码统一在 `errors.md` 维护；本文件触发错误时引用其中的码。

## 核心类型

- `Suit`: `spades | hearts | diamonds | clubs`
- `Rank`: `A | 2 | 3 | ... | 10 | J | Q | K`
- `CardId`: 稳定字符串，例如 `S-A`、`H-10`
- `Card`: `{ id, suit, rank, pointValue, pokerValue }`
- `DeckState`: `{ drawPile, discardPile, burnCards }`
- `Rng`: `() => number`，返回 `[0, 1)` 区间浮点数

`pointValue` 用于数字牌和目标值求和：A = 1，J = 11，Q = 12，K = 13。  
`pokerValue` 用于牌型比较：A = 14，K = 13，Q = 12，J = 11，2 = 2。

> **burnCards 数量固定为 2 张**，从完整 52 张牌中抽出后不参与数字牌生成。burnCards 的抽取、proofHand 保存、运行期是否参与枚举等详见 `02-number-card-generation.md`；本文件只保证 `DeckState.burnCards` 字段存在并接受外部填充。

## 牌 ID 规则

花色前缀固定：

- `S`: spades
- `H`: hearts
- `D`: diamonds
- `C`: clubs

ID 拼接为 `${suitPrefix}-${rank}`。ID 是实体牌的唯一身份，所有重叠、弃牌区、灾厄判断都以 `Card.id` 为准，不使用对象引用比较。

## 函数边界

`card.ts`:

- `createCard(suit, rank): Card`
- `getPointValue(rank): number`
- `getPokerValue(rank): number`
- `createCardId(suit, rank): CardId`

`deck.ts`:

- `buildStandardDeck(): Card[]`
- `shuffleDeck(cards, rng): Card[]`
- `drawCards(cards, count): { drawn, remaining }`
- `uniqueCards(cards): boolean`

`deck-state.ts`:

- `createInitialDeckState(rng): { deckState, fullDeck }`
- `moveEffectiveCardsToDiscard(deckState, effectiveCards): DeckState`
- `isCardUsed(deckState, cardId): boolean`
- `getSelectableCards(deckState): { card, usage }[]`

`getSelectableCards` 返回当前共享牌库和弃牌区中的实体牌。共享牌库中的牌标记为 `unused`，弃牌区中的牌标记为 `used`。HandSolver 依赖这个标记实现“用过牌可选但失效”。

## 详细 API 契约

### `createCard(suit, rank): Card`

作用：根据花色和牌面创建一张不可变实体牌。

参数：

- `suit`: 四种花色之一。
- `rank`: A、2-10、J、Q、K 之一。

返回：

- `Card`，包含稳定 `id`、`pointValue` 和 `pokerValue`。

失败方式：

- TypeScript 类型应阻止非法 suit/rank。
- 运行期不做本地化字符串容错；测试中若绕过类型传入非法值，应抛出 `invalid-card-rank` 或 `invalid-card-suit`。

调用方：

- `buildStandardDeck`
- 测试 fixture
- UI 只读展示 fixture

### `getPointValue(rank): number`

作用：返回数字牌目标值求和使用的点数。

参数：

- `rank`: 合法牌面。

返回：

- A 返回 1。
- 2-10 返回对应数字。
- J/Q/K 返回 11/12/13。

失败方式：

- 非法 rank 抛出 `invalid-card-rank`。

### `getPokerValue(rank): number`

作用：返回牌型比较使用的强弱值。

参数：

- `rank`: 合法牌面。

返回：

- A 返回 14。
- K/Q/J 返回 13/12/11。
- 2-10 返回对应数字。

失败方式：

- 非法 rank 抛出 `invalid-card-rank`。

### `createCardId(suit, rank): CardId`

作用：生成实体牌稳定 ID。

参数：

- `suit`: 合法花色。
- `rank`: 合法牌面。

返回：

- 形如 `S-A`、`H-10` 的 ASCII 字符串。

失败方式：

- 非法 suit/rank 抛出对应错误。

### `buildStandardDeck(): Card[]`

作用：构建一副完整标准扑克牌。

参数：无。

返回：

- 长度为 52 的 `Card[]`。
- 顺序固定（**非建议**）：花色按 `S/H/D/C` 升序，牌面按 `A/2/3/.../10/J/Q/K` 升序。即完整序列为 `S-A, S-2, ..., S-K, H-A, H-2, ..., C-K`。
- 该顺序是事实标准；测试、HandSolver 排序、AI 输入、UI 候选成手排序都依赖这个稳定顺序。

失败方式：

- 不应失败。若内部生成出重复 ID，视为开发错误，测试应捕获。

调用方：

- 新局初始化。
- 数字牌生成。
- 规则单元测试。

### `shuffleDeck(cards, rng): Card[]`

作用：使用 Fisher-Yates 洗牌，返回新数组。

参数：

- `cards`: 要洗牌的实体牌数组。
- `rng`: 返回 `[0, 1)` 的随机函数。

返回：

- 新的 `Card[]`，包含与输入完全相同的实体牌 ID。

失败方式：

- `rng()` 返回 `NaN`、正负 `Infinity`、负数、或 `>= 1` 时抛出 `invalid-rng-value`。
- `cards` 中存在重复 ID 时抛出（视为开发错误，测试拦截）。

副作用：

- 不修改输入数组。

### `drawCards(cards, count): { drawn, remaining }`

作用：从数组头部抽取指定数量实体牌。

参数：

- `cards`: 当前牌堆。
- `count`: 要抽取的张数，必须是 0 到 `cards.length` 的整数。

返回：

- `drawn`: 前 `count` 张牌。
- `remaining`: 剩余牌。

失败方式：

- `count` 非整数、为负数或超过数组长度时抛出 `invalid-draw-count`。

副作用：

- 不修改输入数组。

### `uniqueCards(cards): boolean`

作用：检查实体牌 ID 是否全部唯一。

参数：

- `cards`: 任意实体牌数组。

返回：

- 全部唯一返回 `true`。
- 出现重复 ID 返回 `false`。

### `createInitialDeckState(rng): { deckState, fullDeck }`

作用：创建新局初始牌库状态。

参数：

- `rng`: 可复现随机函数。

返回：

- `deckState.drawPile`: 洗牌后的 52 张牌，等待数字牌生成模块抽取 burnCards 和 proofHand。
- `deckState.discardPile`: 空数组。
- `deckState.burnCards`: 空数组，后续由数字牌生成模块填入。
- `fullDeck`: 未洗牌标准牌库副本，供调试和测试核对。

失败方式：

- 透传 `shuffleDeck` 的 `invalid-rng-value`。

### `moveEffectiveCardsToDiscard(deckState, effectiveCards): DeckState`

作用：把本回合真正生效的实体牌移入弃牌区，并从共享牌库移除。

参数：

- `deckState`: 当前牌库状态。
- `effectiveCards`: 本回合双方有效牌集合，可包含重复 ID。

返回：

- 新的 `DeckState`。
- `drawPile` 中移除这些有效牌。
- `discardPile` 中加入这些有效牌，已存在的 ID 不重复加入。
- `burnCards` 保持不变。

失败方式：

- 若 `effectiveCards` 中有不在 drawPile 且不在 discardPile 的 ID，抛出 `unknown-card-id`。

副作用：

- 不修改输入 `deckState`。

### `isCardUsed(deckState, cardId): boolean`

作用：判断实体牌是否已经进入弃牌区。

参数：

- `deckState`: 当前牌库状态。
- `cardId`: 实体牌 ID。

返回：

- 在 `discardPile` 中返回 `true`。
- 不在 `discardPile` 中返回 `false`。

> 与 `getSelectableCards` 中 `usage === "used"` 等价。两个 API 表达同一信息，UI 应统一从 `getSelectableCards` 派生展示。

### `getSelectableCards(deckState): { card, usage }[]`

作用：返回上层阶段可被表面选择的实体牌集合。

参数：

- `deckState`: 当前牌库状态。

返回：

- `drawPile` 中每张牌返回 `{ usage: "unused" }`，按牌库内部稳定顺序（先 `drawPile`、再 `discardPile`）排列。
- `discardPile` 中每张牌返回 `{ usage: "used" }`，同样按稳定顺序追加。
- 不返回 `burnCards`。
- 不返回 `card.id` 重复项（与 `uniqueCards` 等价）。

稳定顺序定义（与 `getSelectableCards` 一致，HandSolver / AI / UI 都遵循）：

1. 先按容器拆分：`drawPile` 在前、`discardPile` 在后。
2. 同一容器内按实体牌 `card.id` 字典序升序（`S-A < S-2 < ... < S-K < H-A < ... < C-K`）。

用途：

- HandSolver 的 `upperSelection` 模式。
- UI 上层候选组合和弃牌区展示。

## RNG 规则

domain 层只接受 `Rng` 参数，不创建随机源。`src/app/rng.ts` 负责：

- `createSeededRng(seed: string | number): Rng`
- `createRuntimeSeed(): string`
- `createRuntimeRng(): { seed, rng }`

测试必须使用固定 seed。线上运行可以使用随机 seed，但 seed 需要进入调试记录或最近一局摘要，方便复现。

### `createSeededRng(seed): Rng`

作用：根据 seed 创建确定性随机函数。

参数：

- `seed`: 字符串或数字。
  - `string`：空字符串视为非法，抛出 `empty-seed`；非空字符串走 `xfnv1a` 字符串 hash 转 4 个 32-bit state，喂给 `sfc32` PRNG（实现参考见附录 A）。
  - `number`：`NaN` / `Infinity` 等非有限值抛出 `invalid-seed`；有限 number 直接拆为 4 个 8-bit 段（`seed & 0xff`、`(seed >>> 8) & 0xff`、`(seed >>> 16) & 0xff`、`(seed >>> 24) & 0xff`，负数与大数按 `>>> 0` 截断到 32-bit），喂给 `sfc32`。

返回：

- `Rng` 函数。每次调用返回 `[0, 1)`。

要求：

- 同一个 seed 在同一版本实现中产生同一序列。
- 不同浏览器中结果一致（不依赖 `Math.random` 或 `crypto`）。
- 错误码：见 `errors.md` §1。

### `createRuntimeSeed(): string`

作用：创建线上新局默认 seed。

返回：

- 字符串 seed。V1 固定格式：`<ISO 时间戳（毫秒精度）>-<crypto.getRandomValues 取 16 字节 hex>`。
- 例：`2026-06-21T15:49:58.123Z-a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6`。

失败方式：

- `crypto.getRandomValues` 不可用时按 `settings.md` §4 降级为时间戳 + counter 组合 seed，**不抛错**。降级种子前缀不变，便于在调试 UI 识别。

### `createRuntimeRng(): { seed, rng }`

作用：一次性创建 runtime seed 和对应 RNG。

返回：

- `{ seed, rng }`，其中 seed 必须写入 GameState 供调试复现。

## 不变量

- 标准牌库必须有 52 张牌。
- 每张牌 ID 唯一。
- 洗牌前后仍是同一组 52 张实体牌，不丢失、不重复。
- `drawCards` 不修改输入数组，返回新数组。
- 弃牌区中同一实体牌只能出现一次。
- 进入弃牌区的只能是本回合有效牌，失效用过牌不得重复进入弃牌区。
- `getSelectableCards` 始终按"drawPile + discardPile + 字典序"输出稳定顺序，跨调用结果稳定。

## 测试要求

- 生成 52 张牌且 ID 无重复。
- A/J/Q/K 与数字牌点数映射正确。
- A 在 `pokerValue` 中大于 K。
- 洗牌后仍保留 52 个相同 ID。
- 固定 seed 洗牌结果可复现。
- `moveEffectiveCardsToDiscard` 对重复传入的牌去重。
- `getSelectableCards` 同时返回未用牌和弃牌区用过牌，并正确标记 usage。
- `createSeededRng('')` 抛出 `empty-seed`。
- `shuffleDeck` 在 `rng()` 返回 `NaN / Infinity / 负数 / >=1` 时抛出 `invalid-rng-value`。
- 固定 seed "test-seed-001" 在 sfc32 实现下产生的 100 个随机数与附录 A 参考实现 byte-for-byte 相同（CI 锁住）。

## 实现注意

- 不要把 `Card` 做成 class；普通对象更容易序列化和测试。
- 不要让 `shuffleDeck` 直接调用 `Math.random()`。
- 不要在牌 ID 中使用本地化花色字符；稳定 ASCII ID 更适合测试和日志。

## 附录 A：RNG 实现参考

V1 推荐 `sfc32`（Small Fast Counting，Chris Doty-Humphrey）作为 PRNG，配合 `xfnv1a` 字符串 hash 把 string seed 转成 4 个 32-bit state。该组合：

- 同一 seed 跨浏览器 byte-for-byte 相同。
- 周期 ≥ 2^128，V1 单局最多用几万次，远在安全区内。
- 实现约 20 行 TypeScript，无需依赖。

参考实现（伪代码，最终落地到 `src/app/rng.ts`）：

```ts
// xfnv1a: 把 string 转 4 个 32-bit hash
function xfnv1a(str: string): [number, number, number, number] {
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  }
  return [
    (h = Math.imul(h ^ (h >>> 16), 2246822507) ^ (h >>> 13)) >>> 0,
    (h = Math.imul(h ^ (h >>> 16), 2246822507) ^ (h >>> 13)) >>> 0,
    (h = Math.imul(h ^ (h >>> 16), 2246822507) ^ (h >>> 13)) >>> 0,
    (h = Math.imul(h ^ (h >>> 16), 2246822507) ^ (h >>> 13)) >>> 0
  ]
}

// sfc32: 4-state counter-based PRNG
function sfc32(a: number, b: number, c: number, d: number): Rng {
  return function () {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0
    let t = (a + b) | 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) | 0
    c = (c << 21) | (c >>> 11)
    d = (d + 1) | 0
    t = (t + d) | 0
    c = (c + t) | 0
    return (t >>> 0) / 4294967296  // [0, 1)
  }
}

function createSeededRng(seed: string | number): Rng {
  if (seed === "") {
    throw { code: "empty-seed", message: "Seed cannot be empty" }
  }
  const [a, b, c, d] = typeof seed === "string" ? xfnv1a(seed) : [
    seed & 0xff,
    (seed >>> 8) & 0xff,
    (seed >>> 16) & 0xff,
    (seed >>> 24) & 0xff
  ]
  return sfc32(a, b, c, d)
}
```

CI 固定 seed "test-seed-001" 调用 100 次的输出序列应被锁进 `rng.test.ts` 的 `expect` 数组，任何 PR 修改 PRNG 实现必须同时更新该数组并明确说明原因。

## 附录 B：稳定排序 key

本目录所有"稳定顺序"统一指"实体牌 `card.id` 字典序升序"，即 `S-A < S-2 < ... < S-K < H-A < ... < C-K`。

涉及稳定顺序的 API：

- `getSelectableCards`（见上文）。
- `HandSolver.solveHands` 的 `hands` 数组（按枚举生成顺序，最终按 `cards.map(id).join(",")` 字典序）。
- `HandSolver.summarizeSolvedHands` 的内部统计。
- `HandEvaluator.rankSolvedHands` 同强时 tiebreaker。
- `NumberCardGenerator.assignNumberCards` 差距相同时按 `numberCard.id` 升序选组。

非稳定顺序（按"输入序"或"随机"）的 API 必须显式说明，不能套用本约定。
