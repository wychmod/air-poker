// GameState 核心类型与阶段 discriminated union。详见
// `doc/v1-implementation-design/07-game-state-and-round-flow.md`。
//
// 本模块只承载 V1 牌局状态的数据结构与纯构造函数，不包含阶段流转逻辑。
// 状态变更统一通过 `game-reducer.ts` 的 `gameReducer` 推进。

import type { Card, CardId } from '../cards/card';
import type { DeckState } from '../cards/deck-state';
import type { NumberCard, NumberCardId } from '../cards/number-card-generator';
import type { BetAction, BetState } from '../betting/betting-rules';
import type { EvaluatedHand, RankedSolvedHand } from '../hand/hand-evaluator';
import type { SolvedHandSummary } from '../hand/hand-solver';
import type { ErrorPayload } from '../errors';
import type {
  FoldState,
  LockedHand,
  RoundEscrow,
  RoundResolution,
} from './round-resolution';
import type { LastResultSummary, Settings } from '../../app/settings';

export type GamePhase =
  | 'idle'
  | 'initializing'
  | 'roundStart'
  | 'lowerSelect'
  | 'solveHands'
  | 'upperSelect'
  | 'betting'
  | 'showdown'
  | 'resolve'
  | 'roundSummary'
  | 'gameOver';

// 回合开始扣费记录：呼吸成本固定 1，参加费为当前回合数（决胜回合按 5）。
export type RoundCosts = {
  breathing: number;
  playerAnte: number;
  aiAnte: number;
};

export type Ante = {
  playerAnte: number;
  aiAnte: number;
};

// 双方公开目标值。AI 数字牌由系统动作 aiSelectedNumberCard 在玩家选牌前注入。
export type PublicTargets = {
  playerNumberCardId: NumberCardId | null;
  aiNumberCardId: NumberCardId | null;
  playerTargetValue: number | null;
  aiTargetValue: number | null;
};

export type ShowdownView = {
  playerLockedHand: LockedHand;
  aiLockedHand: LockedHand;
  overlappingCardIds: CardId[];
};

// currentRound 为 discriminated union，phase 作为顶层判别符，便于 reducer 收窄。
// idle / initializing 阶段无回合数据，用专用分支表达。
// 注意：CurrentRound 仅描述回合字段；GameState 用 phase + currentRound 双判别符
// 联合，保证 `state.phase !== 'xxx'` 能同时收窄 currentRound。
export type CurrentRound =
  | { phase: 'idle' }
  | { phase: 'initializing' }
  | ({ phase: 'roundStart' } & RoundStartData)
  | ({ phase: 'lowerSelect' } & LowerSelectData)
  | ({ phase: 'solveHands' } & SolveHandsData)
  | ({ phase: 'upperSelect' } & UpperSelectData)
  | ({ phase: 'betting' } & BettingData)
  | ({ phase: 'showdown' } & ShowdownData)
  | ({ phase: 'resolve' } & ResolveData)
  | ({ phase: 'roundSummary' } & RoundSummaryData)
  | ({ phase: 'gameOver' } & GameOverData);

export type RoundStartData = {
  roundCosts: RoundCosts;
};

export type LowerSelectData = {
  publicTargets: PublicTargets;
  numberCardCost: number;
  ante: Ante;
};

export type SolveHandsData = {
  publicTargets: PublicTargets;
  playerPossibleHandSummary: SolvedHandSummary;
};

export type UpperSelectData = {
  publicTargets: PublicTargets;
  playerCandidateHands: RankedSolvedHand[];
  playerPossibleHandSummary: SolvedHandSummary;
  playerLockedHand: LockedHand | null;
  autoLocked: boolean;
  aiLockedHand: LockedHand | null;
};

export type BettingData = {
  publicTargets: PublicTargets;
  playerLockedHand: LockedHand;
  aiLockedHand: LockedHand;
  betState: BetState;
  betActions: BetAction[];
  foldState: FoldState;
  autoLocked: boolean;
  ante: Ante;
};

export type ShowdownData = {
  publicTargets: PublicTargets;
  playerLockedHand: LockedHand;
  aiLockedHand: LockedHand;
  showdown: ShowdownView;
  foldState: FoldState;
  ante: Ante;
  // betState 在 showdown / resolve / roundSummary 保留，用于结算 escrow。
  betState: BetState;
  betActions: BetAction[];
};

export type ResolveData = {
  publicTargets: PublicTargets;
  playerLockedHand: LockedHand;
  aiLockedHand: LockedHand;
  resolution: RoundResolution;
  foldState: FoldState;
  ante: Ante;
  betState: BetState;
  betActions: BetAction[];
};

export type RoundSummaryData = {
  publicTargets: PublicTargets;
  playerLockedHand: LockedHand;
  aiLockedHand: LockedHand;
  resolution: RoundResolution;
  foldState: FoldState;
  ante: Ante;
  betState: BetState;
  betActions: BetAction[];
};

export type GameOverData = {
  finalResult: LastResultSummary;
};

export type RoundHistoryEntry = {
  roundNumber: number;
  isTiebreaker: boolean;
  playerNumberCardId: NumberCardId;
  aiNumberCardId: NumberCardId;
  playerTargetValue: number;
  aiTargetValue: number;
  playerHand: LockedHand;
  aiHand: LockedHand;
  betActions: BetAction[];
  foldState: FoldState;
  resolution: RoundResolution;
  escrow: RoundEscrow;
};

export type GameStateBase = {
  version: 1;
  seed: string;
  phase: GamePhase;
  roundNumber: number;
  isTiebreaker: boolean;
  playerAir: number;
  aiAir: number;
  deckState: DeckState;
  numberCards: {
    player: NumberCard[];
    ai: NumberCard[];
  };
  roundHistory: RoundHistoryEntry[];
  settingsSnapshot: Settings;
  lastError: ErrorPayload | null;
  // 累计赢得底池（净赢得 Bet 之和），用于 R5 平手决胜。
  playerPool: number;
  aiPool: number;
};

export type GameState = GameStateBase &
  (
    | { phase: 'idle'; currentRound: { phase: 'idle' } }
    | { phase: 'initializing'; currentRound: { phase: 'initializing' } }
    | { phase: 'roundStart'; currentRound: { phase: 'roundStart' } & RoundStartData }
    | { phase: 'lowerSelect'; currentRound: { phase: 'lowerSelect' } & LowerSelectData }
    | { phase: 'solveHands'; currentRound: { phase: 'solveHands' } & SolveHandsData }
    | { phase: 'upperSelect'; currentRound: { phase: 'upperSelect' } & UpperSelectData }
    | { phase: 'betting'; currentRound: { phase: 'betting' } & BettingData }
    | { phase: 'showdown'; currentRound: { phase: 'showdown' } & ShowdownData }
    | { phase: 'resolve'; currentRound: { phase: 'resolve' } & ResolveData }
    | {
        phase: 'roundSummary';
        currentRound: { phase: 'roundSummary' } & RoundSummaryData;
      }
    | { phase: 'gameOver'; currentRound: { phase: 'gameOver' } & GameOverData }
  );

// 重新导出领域类型，方便 reducer / flow 集中引用。
export type {
  Card,
  CardId,
  DeckState,
  NumberCard,
  NumberCardId,
  BetAction,
  BetState,
  EvaluatedHand,
  RankedSolvedHand,
  SolvedHandSummary,
  FoldState,
  LockedHand,
  RoundEscrow,
  RoundResolution,
  LastResultSummary,
  Settings,
  ErrorPayload,
};
