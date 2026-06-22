export type HandCategory =
  | 'RoyalStraightFlush'
  | 'StraightFlush'
  | 'FourOfAKind'
  | 'FullHouse'
  | 'Flush'
  | 'Straight'
  | 'ThreeOfAKind'
  | 'TwoPair'
  | 'OnePair'
  | 'HighCard'
  | 'NoEffectiveCards';

export const HAND_CATEGORY_RANK: Record<HandCategory, number> = {
  RoyalStraightFlush: 10,
  StraightFlush: 9,
  FourOfAKind: 8,
  FullHouse: 7,
  Flush: 6,
  Straight: 5,
  ThreeOfAKind: 4,
  TwoPair: 3,
  OnePair: 2,
  HighCard: 1,
  NoEffectiveCards: 0,
};

export const HAND_CATEGORY_LABEL: Record<HandCategory, string> = {
  RoyalStraightFlush: '皇家同花顺',
  StraightFlush: '同花顺',
  FourOfAKind: '四条',
  FullHouse: '葫芦',
  Flush: '同花',
  Straight: '顺子',
  ThreeOfAKind: '三条',
  TwoPair: '两对',
  OnePair: '一对',
  HighCard: '高牌',
  NoEffectiveCards: '无有效牌',
};

const HAND_CATEGORY_BASE_SCORE: Record<HandCategory, number> = {
  RoyalStraightFlush: 1000,
  StraightFlush: 900,
  FourOfAKind: 800,
  FullHouse: 700,
  Flush: 600,
  Straight: 500,
  ThreeOfAKind: 400,
  TwoPair: 300,
  OnePair: 200,
  HighCard: 100,
  NoEffectiveCards: 0,
};

export function getHandCategoryBaseScore(category: HandCategory): number {
  return HAND_CATEGORY_BASE_SCORE[category];
}
