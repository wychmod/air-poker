// round-flow.ts：V1 回合编排层。详见
// `doc/v1-implementation-design/07-game-state-and-round-flow.md`「AI 决策的同步/异步」。
//
// 职责：在适当时机调用 AI 决策函数，把结果作为系统动作返回给调用方 dispatch。
// - roundStart -> lowerSelect：调用 chooseLowerNumberCard 产 aiSelectedNumberCard。
// - upperSelect：调用 chooseUpperHand 产 aiLockedHand（在玩家 enterBetting 前）。
// - betting（awaitingAi）：调用 chooseBetAction 产 aiSubmittedBetAction。
//
// 本层不直接修改 GameState，只返回待 dispatch 的系统动作列表。
// 真实 AI 决策（LowerAI/UpperAI/BettingAI）属于 08，本层通过注入点接收。
// 玩家候选成手枚举由本层在 solveHands 阶段调用 enumeratePlayerCandidateHands 产
// solveHandsSucceeded 系统动作。

import type { BetAction } from '../betting/betting-rules';
import type { Card } from '../cards/card';
import type { NumberCardId } from '../cards/number-card-generator';
import type { RankedSolvedHand } from '../hand/hand-evaluator';
import type { SolvedHandSummary } from '../hand/hand-solver';
import type { GameState } from './game-state';
import type {
  AiLockedHandAction,
  AiSelectedNumberCardAction,
  AiSubmittedBetActionAction,
  SolveHandsSucceededAction,
} from './game-actions';
import type { LockedHand } from './round-resolution';
import { enumeratePlayerCandidateHands } from './game-reducer';

// AI 决策注入点。08 实现真实策略；测试可注入确定性 stub。
export type AiDecisionFunctions = {
  // lowerSelect 阶段：AI 选择可用可解数字牌。返回 null 表示无可用牌（由 reducer 判负）。
  chooseLowerNumberCard: (view: LowerAiView) => NumberCardId | null;
  // upperSelect 阶段：AI 锁定成手。返回 null 表示无候选。
  chooseUpperHand: (view: UpperAiView) => LockedHand | null;
  // betting 阶段（awaitingAi）：AI 选择下注动作。
  chooseBetAction: (view: BettingAiView) => BetAction;
};

// AI 公平信息边界：只暴露 AI 决策应可见的字段，不传入完整 GameState（08 钉死）。
export type LowerAiView = {
  aiNumberCards: GameState['numberCards']['ai'];
  drawPile: Card[];
  roundNumber: number;
  isTiebreaker: boolean;
};

export type UpperAiView = {
  aiTargetValue: number;
  drawPile: Card[];
  discardPile: Card[];
  roundNumber: number;
  isTiebreaker: boolean;
};

export type BettingAiView = {
  playerLockedHand: LockedHand;
  aiLockedHand: LockedHand;
  roundNumber: number;
  isTiebreaker: boolean;
};

// 编排结果：调用方按顺序 dispatch 这些系统动作。
export type OrchestratorOutput = {
  actions: Array<
    | AiSelectedNumberCardAction
    | SolveHandsSucceededAction
    | AiLockedHandAction
    | AiSubmittedBetActionAction
  >;
};

// 判断当前是否需要 AI / 系统推进，并产出相应系统动作。
// 不修改 state；调用方拿到 actions 后逐个 dispatch。
export function planSystemActions(
  state: GameState,
  ai: AiDecisionFunctions,
  now: () => number,
): OrchestratorOutput {
  const actions: OrchestratorOutput['actions'] = [];

  switch (state.phase) {
    case 'lowerSelect': {
      // AI 数字牌预选：在玩家 selectNumberCard 之前注入。
      if (state.currentRound.publicTargets.aiNumberCardId !== null) {
        break;
      }
      const view: LowerAiView = {
        aiNumberCards: state.numberCards.ai,
        drawPile: state.deckState.drawPile,
        roundNumber: state.roundNumber,
        isTiebreaker: state.isTiebreaker,
      };
      const choice = ai.chooseLowerNumberCard(view);
      if (choice !== null) {
        actions.push({ type: 'aiSelectedNumberCard', numberCardId: choice });
      }
      break;
    }

    case 'solveHands': {
      // 枚举玩家候选成手并产 solveHandsSucceeded。
      const targetValue = state.currentRound.publicTargets.playerTargetValue;
      if (targetValue === null) {
        break;
      }
      const { ranked, summary } = enumeratePlayerCandidateHands(
        targetValue,
        state.deckState.drawPile,
        state.deckState.discardPile,
      );
      actions.push({
        type: 'solveHandsSucceeded',
        playerCandidateHands: ranked satisfies RankedSolvedHand[],
        playerPossibleHandSummary: summary satisfies SolvedHandSummary,
      });
      break;
    }

    case 'upperSelect': {
      // AI 锁定成手（若尚未锁定）。
      if (state.currentRound.aiLockedHand !== null) {
        break;
      }
      const view: UpperAiView = {
        aiTargetValue: state.currentRound.publicTargets.aiTargetValue ?? 0,
        drawPile: state.deckState.drawPile,
        discardPile: state.deckState.discardPile,
        roundNumber: state.roundNumber,
        isTiebreaker: state.isTiebreaker,
      };
      const hand = ai.chooseUpperHand(view);
      if (hand !== null) {
        actions.push({ type: 'aiLockedHand', hand });
      }
      break;
    }

    case 'betting': {
      // awaitingAi 时 AI 行动。
      if (state.currentRound.betState.status !== 'awaitingAi') {
        break;
      }
      const view: BettingAiView = {
        playerLockedHand: state.currentRound.playerLockedHand,
        aiLockedHand: state.currentRound.aiLockedHand,
        roundNumber: state.roundNumber,
        isTiebreaker: state.isTiebreaker,
      };
      const action = ai.chooseBetAction(view);
      actions.push({ type: 'aiSubmittedBetAction', action, now });
      break;
    }

    default:
      break;
  }

  return { actions };
}

// 确定性 AI stub：仅供测试端到端跑通主路径，不放入 src/domain/ai/（08 实现）。
// - lower：选第一张可用可解数字牌。
// - upper：选第一组候选成手（最强）。
// - betting：可 check 则 check，否则 fold（最保守）。
export function createDeterministicAiStub(
  candidatesForUpper: (view: UpperAiView) => LockedHand | null,
): AiDecisionFunctions {
  return {
    chooseLowerNumberCard: (view) => {
      const available = view.aiNumberCards.find((c) => c.status === 'available');
      return available === undefined ? null : available.id;
    },
    chooseUpperHand: candidatesForUpper,
    chooseBetAction: (view) => {
      // 无下注压力时 check；有压力时 fold（避免复杂 call 逻辑）。
      const playerBet = 0; // stub 不读 BetState，统一最小动作。
      void view;
      void playerBet;
      return { actor: 'ai', type: 'check', amount: 0 };
    },
  };
}
