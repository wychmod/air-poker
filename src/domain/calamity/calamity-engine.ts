// 回合灾厄判定与扣减。详见
// `doc/v1-implementation-design/06-round-resolution-and-calamity.md`。
//
// 灾厄只比较双方 effectiveCards 的实体牌 ID；表面选中但失效的用过牌不参与重叠。

import { type Card, type CardId } from '../cards/card';
import { createAppError } from '../errors';

// 双方有效牌 ID 集合的交集。triggered 表示是否触发灾厄。
export type CalamityDetection = {
  triggered: boolean;
  overlappingCardIds: CardId[];
};

// 灾厄额外扣减结果。playerDeduction / aiDeduction 为各自实际被扣的 Air
// （不足时扣到 0）；vanishedAir 为双方额外扣减总和，按「应有额」记录。
export type CalamityPenalty = {
  playerDeduction: number;
  aiDeduction: number;
  vanishedAir: number;
};

export type CalamityActor = 'player' | 'ai';

export type ApplyCalamityPenaltyInput = {
  triggered: boolean;
  loser: CalamityActor | null;
  escrow: {
    playerBet: number;
    aiBet: number;
  };
  playerAir: number;
  aiAir: number;
};

// 校验 effectiveCards 内部是否存在重复 ID。任一方重复视为开发错误。
function assertNoDuplicateEffectiveCards(cards: Card[], owner: string): void {
  const seen = new Set<CardId>();
  for (const card of cards) {
    if (seen.has(card.id)) {
      throw createAppError(
        'duplicate-effective-card',
        `${owner} effectiveCards 内部出现重复 ID`,
        {
          details: { cardId: card.id, owner },
        },
      );
    }
    seen.add(card.id);
  }
}

// 按 id 字典序升序排序（见 01 文档附录 B）。
function sortCardIdsAsc(ids: CardId[]): CardId[] {
  return [...ids].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}

// 判断双方有效牌是否重叠。
export function detectCalamity(
  playerEffectiveCards: Card[],
  aiEffectiveCards: Card[],
): CalamityDetection {
  assertNoDuplicateEffectiveCards(playerEffectiveCards, 'player');
  assertNoDuplicateEffectiveCards(aiEffectiveCards, 'ai');

  // 任一方为空时不触发（0 vs 0、0 vs N 均不算重叠）。
  if (playerEffectiveCards.length === 0 || aiEffectiveCards.length === 0) {
    return { triggered: false, overlappingCardIds: [] };
  }

  const aiIds = new Set(aiEffectiveCards.map((card) => card.id));
  const overlapping = new Set<CardId>();

  for (const card of playerEffectiveCards) {
    if (aiIds.has(card.id)) {
      overlapping.add(card.id);
    }
  }

  const overlappingCardIds = sortCardIdsAsc([...overlapping]);

  return {
    triggered: overlappingCardIds.length > 0,
    overlappingCardIds,
  };
}

// 根据灾厄与输家计算额外 Air 扣减。
//
// V1 钉死：输家额外扣减自己的下注额（escrow.loserBet），Air 不足时扣到 0；
// vanishedAir 按「应有额」记录，未实际扣的部分仍计入消失总额。
export function applyCalamityPenalty(input: ApplyCalamityPenaltyInput): CalamityPenalty {
  const { triggered, loser, escrow, playerAir, aiAir } = input;

  if (!triggered || loser === null) {
    return { playerDeduction: 0, aiDeduction: 0, vanishedAir: 0 };
  }

  if (loser === 'player') {
    const owed = escrow.playerBet;
    const deduction = Math.min(owed, Math.max(playerAir, 0));
    return { playerDeduction: deduction, aiDeduction: 0, vanishedAir: owed };
  }

  const owed = escrow.aiBet;
  const deduction = Math.min(owed, Math.max(aiAir, 0));
  return { playerDeduction: 0, aiDeduction: deduction, vanishedAir: owed };
}
