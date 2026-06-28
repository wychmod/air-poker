// GameAction discriminated union：用户动作与系统动作统一入口。
// 详见 `doc/v1-implementation-design/07-game-state-and-round-flow.md`「Action 设计」。
//
// openPanel / closePanel 不进入 reducer（07 文档钉死：panels 由 useGameController
// 的 useState 维护），故不在本 union 中。

import type { BetAction } from '../betting/betting-rules';
import type { NumberCardId } from '../cards/number-card-generator';
import type { LastResultSummary, Settings } from '../../app/settings';
import type { RankedSolvedHand } from '../hand/hand-evaluator';
import type { PlayerPossibleHandSummary } from '../ai/ai-types';
import type { DeckState, LockedHand, NumberCard } from './game-state';
import type { Outcome, EndReason } from '../../app/settings';

// ---------- 用户动作 ----------

export type StartNewGameAction = {
  type: 'startNewGame';
  seed: string;
  rng: () => number;
  deckState: DeckState;
  numberCards: { player: NumberCard[]; ai: NumberCard[] };
  settingsSnapshot: Settings;
};

export type SelectNumberCardAction = {
  type: 'selectNumberCard';
  numberCardId: NumberCardId;
};

export type LockPlayerHandAction = {
  type: 'lockPlayerHand';
  handId: string;
};

export type AutoLockRecommendedHandAction = {
  type: 'autoLockRecommendedHand';
};

export type EnterBettingAction = {
  type: 'enterBetting';
  now: () => number;
};

export type SubmitBetActionAction = {
  type: 'submitBetAction';
  action: BetAction;
  now?: () => number;
};

export type ConfirmDangerousActionAction = {
  type: 'confirmDangerousAction';
  actionId: string;
  confirmed: boolean;
};

export type ContinueToNextRoundAction = {
  type: 'continueToNextRound';
};

export type RestartGameAction = {
  type: 'restartGame';
  seed: string;
  rng: () => number;
  deckState: DeckState;
  numberCards: { player: NumberCard[]; ai: NumberCard[] };
  settingsSnapshot: Settings;
};

export type UpdateSettingsAction = {
  type: 'updateSettings';
  patch: Partial<Settings>;
};

export type UserGameAction =
  | StartNewGameAction
  | SelectNumberCardAction
  | LockPlayerHandAction
  | AutoLockRecommendedHandAction
  | EnterBettingAction
  | SubmitBetActionAction
  | ConfirmDangerousActionAction
  | ContinueToNextRoundAction
  | RestartGameAction
  | UpdateSettingsAction;

// ---------- 系统动作 ----------

export type InitializationSucceededAction = {
  type: 'initializationSucceeded';
  seed: string;
  deckState: DeckState;
  numberCards: { player: NumberCard[]; ai: NumberCard[] };
  settingsSnapshot: Settings;
};

export type InitializationFailedAction = {
  type: 'initializationFailed';
  code: string;
  message: string;
};

export type ApplyRoundCostsAction = {
  type: 'applyRoundCosts';
};

export type AiSelectedNumberCardAction = {
  type: 'aiSelectedNumberCard';
  numberCardId: NumberCardId;
};

export type SolveHandsSucceededAction = {
  type: 'solveHandsSucceeded';
  playerCandidateHands: RankedSolvedHand[];
  playerPossibleHandSummary: PlayerPossibleHandSummary;
};

export type SolveHandsFailedAction = {
  type: 'solveHandsFailed';
  code: string;
  message: string;
};

export type AiLockedHandAction = {
  type: 'aiLockedHand';
  hand: LockedHand;
};

export type AiSubmittedBetActionAction = {
  type: 'aiSubmittedBetAction';
  action: BetAction;
  now?: () => number;
};

export type BetClosedAction = {
  type: 'betClosed';
};

export type ShowdownAction = {
  type: 'showdown';
};

export type ResolveRoundAction = {
  type: 'resolveRound';
};

export type FinishGameAction = {
  type: 'finishGame';
  outcome: Outcome;
  endReason: EndReason;
  now: () => string;
};

export type SystemGameAction =
  | InitializationSucceededAction
  | InitializationFailedAction
  | ApplyRoundCostsAction
  | AiSelectedNumberCardAction
  | SolveHandsSucceededAction
  | SolveHandsFailedAction
  | AiLockedHandAction
  | AiSubmittedBetActionAction
  | BetClosedAction
  | ShowdownAction
  | ResolveRoundAction
  | FinishGameAction;

export type GameAction = UserGameAction | SystemGameAction;

export type { LastResultSummary };
