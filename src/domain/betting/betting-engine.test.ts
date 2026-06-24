import { describe, expect, it } from 'vitest';

import {
  applyBetAction,
  createInitialBetState,
  getCallAmount,
  getLegalBetActions,
  getMaxBetAmount,
  getMaxRaiseAmount,
  getMinRaiseIncrement,
  getTimeoutBetAction,
  getTotalBetLimit,
  validateBetAction,
} from './betting-engine';
import { type BetAction, type BetState } from './betting-rules';

function createState(overrides: Partial<BetState> = {}): BetState {
  return {
    playerBet: 0,
    aiBet: 0,
    playerAvailableAir: 25,
    aiAvailableAir: 25,
    status: 'awaitingPlayer',
    lastAggressor: null,
    lastRaiseIncrement: 0,
    raiseCount: 0,
    turnStartedAt: null,
    ...overrides,
  };
}

function action(
  actor: BetAction['actor'],
  type: BetAction['type'],
  amount = 0,
): BetAction {
  return { actor, type, amount };
}

function findAction(state: BetState, actor: BetAction['actor'], type: BetAction['type']) {
  return getLegalBetActions(state, actor).find((a) => a.type === type);
}

// 断言 applyBetAction 成功并取出下一状态；失败时让测试直接报错。
function nextState(state: BetState, act: BetAction): BetState {
  const result = applyBetAction(state, act);
  if (!result.ok) {
    throw new Error(`Expected applyBetAction to succeed, got code=${result.code}`);
  }
  return result.state;
}

describe('betting/createInitialBetState', () => {
  it('creates the canonical initial state', () => {
    expect(
      createInitialBetState({ playerAvailableAir: 25, aiAvailableAir: 25 }),
    ).toStrictEqual({
      playerBet: 0,
      aiBet: 0,
      playerAvailableAir: 25,
      aiAvailableAir: 25,
      status: 'awaitingPlayer',
      lastAggressor: null,
      lastRaiseIncrement: 0,
      raiseCount: 0,
      turnStartedAt: null,
    });
  });

  it('rejects negative or non-integer air with invalid-available-air', () => {
    function expectInvalidAir(air: number) {
      try {
        createInitialBetState({ playerAvailableAir: air, aiAvailableAir: 25 });
        throw new Error('Expected createInitialBetState to throw');
      } catch (error) {
        expect((error as { code?: string }).code).toBe('invalid-available-air');
      }
    }
    expectInvalidAir(-1);
    expectInvalidAir(1.5);
  });
});

describe('betting/initial phase legal actions', () => {
  it('allows check and bet, disables raise and fold at 0 total bet', () => {
    const state = createState();

    expect(findAction(state, 'player', 'check')).toMatchObject({
      minAmount: 0,
      maxAmount: 0,
    });
    expect(findAction(state, 'player', 'bet')).toMatchObject({
      minAmount: 1,
      maxAmount: 25,
    });
    expect(findAction(state, 'player', 'raise')?.disabledReason).toBe('action-not-legal');
    expect(findAction(state, 'player', 'fold')?.disabledReason).toBe(
      'no-fold-without-pressure',
    );
  });

  it('disables all actions with not-current-actor when actor mismatch', () => {
    const state = createState({ status: 'awaitingAi' });
    const legal = getLegalBetActions(state, 'player');
    expect(legal.every((a) => a.disabledReason === 'not-current-actor')).toBe(true);
  });

  it('returns empty array when status is closed', () => {
    const state = createState({ status: 'closed' });
    expect(getLegalBetActions(state, 'player')).toEqual([]);
  });
});

describe('betting/validateBetAction initial phase', () => {
  const state = createState();

  it('rejects fold with no-fold-without-pressure', () => {
    expect(validateBetAction(state, action('player', 'fold'))).toMatchObject({
      ok: false,
      code: 'no-fold-without-pressure',
    });
  });

  it('rejects raise with action-not-legal', () => {
    expect(validateBetAction(state, action('player', 'raise', 5))).toMatchObject({
      ok: false,
      code: 'action-not-legal',
    });
  });

  it('rejects bet out of range with invalid-amount', () => {
    expect(validateBetAction(state, action('player', 'bet', 0))).toMatchObject({
      ok: false,
      code: 'invalid-amount',
    });
    expect(validateBetAction(state, action('player', 'bet', 26))).toMatchObject({
      ok: false,
      code: 'invalid-amount',
    });
  });

  it('accepts a valid bet', () => {
    expect(validateBetAction(state, action('player', 'bet', 3))).toMatchObject({
      ok: true,
      normalizedAction: { actor: 'player', type: 'bet', amount: 3 },
    });
  });
});

describe('betting/facing pressure legal actions', () => {
  const state = createState({
    playerBet: 3,
    aiBet: 0,
    status: 'awaitingAi',
    lastAggressor: 'player',
  });

  it('allows call, raise, fold, allIn; disables bet', () => {
    expect(findAction(state, 'ai', 'call')).toMatchObject({ minAmount: 3, maxAmount: 3 });
    expect(findAction(state, 'ai', 'fold')).toMatchObject({ minAmount: 0, maxAmount: 0 });
    expect(findAction(state, 'ai', 'raise')?.disabledReason).toBeUndefined();
    expect(findAction(state, 'ai', 'allIn')?.disabledReason).toBeUndefined();
    expect(findAction(state, 'ai', 'bet')?.disabledReason).toBe('action-not-legal');
    // 双方下注不等，check 非法。
    expect(findAction(state, 'ai', 'check')?.disabledReason).toBe('action-not-legal');
  });

  it('sets raise minAmount high enough to beat the current opposing bet', () => {
    expect(findAction(state, 'ai', 'raise')).toMatchObject({
      minAmount: 4,
      maxAmount: 25,
    });
  });
});

describe('betting/min-raise constraint', () => {
  // 接示例 3：玩家 bet 3 后 AI raise 到 5（增量 5），lastRaiseIncrement=5。
  function afterPlayerBetAiRaise(): BetState {
    let s = createState();
    s = nextState(s, action('player', 'bet', 3));
    s = nextState(s, action('ai', 'raise', 5)); // AI 0 -> 5, 增量 5
    return s;
  }

  it('rejects raise increment below lastRaiseIncrement', () => {
    const state = afterPlayerBetAiRaise();
    // 玩家 3，需补到至少 5 + 5 = 10，增量 5 合法；增量 4 违反 min-raise。
    expect(validateBetAction(state, action('player', 'raise', 4))).toMatchObject({
      ok: false,
      code: 'raise-increment-below-minimum',
    });
  });

  it('accepts raise increment >= lastRaiseIncrement and updates lastRaiseIncrement', () => {
    const state = afterPlayerBetAiRaise();
    const result = applyBetAction(state, action('player', 'raise', 6)); // 3 -> 9, 增量 6
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.lastRaiseIncrement).toBe(6);
      expect(result.state.raiseCount).toBe(2);
      expect(result.state.playerBet).toBe(9);
    }
  });

  it('rejects raise increment exceeding maxRaise', () => {
    // 限制玩家 Air 使 raise 上限收紧。玩家 Air 8：bet 3 后剩 5；
    // AI raise 后轮到玩家，actorBet=3，maxRaise = min(5, totalBetLimit - 3)。
    // totalBetLimit = min(8, 25) = 8，故 maxRaise = min(5, 5) = 5。
    // minRaise = 5（AI raise 增量 5），raise 6 > maxRaise(5) → raise-exceeds-limit。
    let s = createState({ playerAvailableAir: 8, aiAvailableAir: 25 });
    s = nextState(s, action('player', 'bet', 3));
    s = nextState(s, action('ai', 'raise', 5)); // ai 0->5, inc 5
    const result = applyBetAction(s, action('player', 'raise', 6));
    expect(result).toMatchObject({ ok: false, code: 'raise-exceeds-limit' });
  });

  it('rejects raise amounts that do not pass the current opposing bet', () => {
    const state = createState({
      playerBet: 3,
      aiBet: 0,
      status: 'awaitingAi',
      lastAggressor: 'player',
    });

    expect(validateBetAction(state, action('ai', 'raise', 1))).toMatchObject({
      ok: false,
      code: 'raise-increment-below-minimum',
    });
    expect(applyBetAction(state, action('ai', 'raise', 3))).toMatchObject({
      ok: false,
      code: 'raise-increment-below-minimum',
    });
  });

  it('accepts the first raise only after covering call pressure plus one Air', () => {
    const state = createState({
      playerBet: 3,
      aiBet: 0,
      status: 'awaitingAi',
      lastAggressor: 'player',
    });

    const result = applyBetAction(state, action('ai', 'raise', 4));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.aiBet).toBe(4);
      expect(result.state.lastRaiseIncrement).toBe(4);
      expect(result.state.raiseCount).toBe(1);
    }
  });
});

describe('betting/multi-round convergence', () => {
  it('player bet -> ai raise -> player raise -> ai call -> closed', () => {
    let s = createState();
    s = nextState(s, action('player', 'bet', 3));
    s = nextState(s, action('ai', 'raise', 5)); // ai 0->5, inc 5
    s = nextState(s, action('player', 'raise', 6)); // player 3->9, inc 6
    s = nextState(s, action('ai', 'raise', 7)); // ai 5->12, inc 7
    expect(s.status).toBe('awaitingPlayer');
    s = nextState(s, action('player', 'call', 3)); // player 9->12
    expect(s.status).toBe('closed');
    expect(s.playerBet).toBe(12);
    expect(s.aiBet).toBe(12);
  });

  it('player bet -> ai raise -> player call -> closed (player does not raise)', () => {
    let s = createState();
    s = nextState(s, action('player', 'bet', 3));
    s = nextState(s, action('ai', 'raise', 5)); // ai 0->5
    s = nextState(s, action('player', 'call', 2)); // player 3->5
    expect(s.status).toBe('closed');
    expect(s.playerBet).toBe(5);
    expect(s.aiBet).toBe(5);
  });

  it('player bet -> ai call -> closed (ai does not raise)', () => {
    let s = createState();
    s = nextState(s, action('player', 'bet', 3));
    s = nextState(s, action('ai', 'call', 3));
    expect(s.status).toBe('closed');
    expect(s.aiBet).toBe(3);
  });

  it('player check at 0 total bet -> closed', () => {
    let s = createState();
    s = nextState(s, action('player', 'check'));
    expect(s.status).toBe('closed');
  });
});

describe('betting/lastRaiseIncrement and raiseCount updates', () => {
  it('bet does not update lastRaiseIncrement / raiseCount', () => {
    let s = createState();
    s = nextState(s, action('player', 'bet', 3));
    expect(s.lastRaiseIncrement).toBe(0);
    expect(s.raiseCount).toBe(0);
    expect(s.lastAggressor).toBe('player');
  });

  it('allIn does not update lastRaiseIncrement / raiseCount', () => {
    let s = createState({ playerAvailableAir: 6, aiAvailableAir: 6 });
    s = nextState(s, action('player', 'allIn'));
    expect(s.lastRaiseIncrement).toBe(0);
    expect(s.raiseCount).toBe(0);
    expect(s.lastAggressor).toBe('player');
  });

  it('check / call / fold do not update aggressor fields', () => {
    let s = createState();
    s = nextState(s, action('player', 'bet', 3));
    s = nextState(s, action('ai', 'call', 3));
    expect(s.lastAggressor).toBe('player');
    expect(s.lastRaiseIncrement).toBe(0);
    expect(s.raiseCount).toBe(0);
  });
});

describe('betting/all-in', () => {
  it('truncates all-in amount by lower air side (player 10 / ai 6 -> 6)', () => {
    const s = createState({ playerAvailableAir: 10, aiAvailableAir: 6 });
    const result = applyBetAction(s, action('player', 'allIn'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.playerBet).toBe(6);
      expect(result.state.playerAvailableAir).toBe(4);
      expect(result.state.status).toBe('awaitingAi');
    }
  });

  it('after all-in opponent can only call / fold', () => {
    let s = createState({ playerAvailableAir: 10, aiAvailableAir: 6 });
    s = nextState(s, action('player', 'allIn')); // player 6, awaitingAi
    const legal = getLegalBetActions(s, 'ai');
    expect(findAction(s, 'ai', 'raise')?.disabledReason).toBe('action-not-legal');
    expect(findAction(s, 'ai', 'bet')?.disabledReason).toBe('action-not-legal');
    expect(findAction(s, 'ai', 'check')?.disabledReason).toBe('action-not-legal');
    expect(findAction(s, 'ai', 'allIn')?.disabledReason).toBe('action-not-legal');
    expect(legal.some((a) => a.type === 'call' && a.disabledReason === undefined)).toBe(
      true,
    );
    expect(legal.some((a) => a.type === 'fold' && a.disabledReason === undefined)).toBe(
      true,
    );
  });

  it('ai call after player all-in -> closed', () => {
    let s = createState({ playerAvailableAir: 10, aiAvailableAir: 6 });
    s = nextState(s, action('player', 'allIn'));
    s = nextState(s, action('ai', 'call', 6));
    expect(s.status).toBe('closed');
    expect(s.aiBet).toBe(6);
    expect(s.playerBet).toBe(6);
  });

  it('ai fold after player all-in -> closed', () => {
    let s = createState({ playerAvailableAir: 10, aiAvailableAir: 6 });
    s = nextState(s, action('player', 'allIn'));
    s = nextState(s, action('ai', 'fold'));
    expect(s.status).toBe('closed');
  });
});

describe('betting/totalBetLimit helpers', () => {
  it('getTotalBetLimit returns min of both sides cumulative capacity', () => {
    const state = createState({
      playerBet: 3,
      aiBet: 0,
      playerAvailableAir: 22,
      aiAvailableAir: 25,
    });
    expect(getTotalBetLimit(state)).toBe(25);
  });

  it('getMaxBetAmount returns 0 outside initial phase', () => {
    const state = createState({ playerBet: 3, aiBet: 0 });
    expect(getMaxBetAmount(state, 'ai')).toBe(0);
  });

  it('getMaxRaiseAmount returns 0 in initial phase', () => {
    expect(getMaxRaiseAmount(createState(), 'player')).toBe(0);
  });

  it('getMinRaiseIncrement defaults to 1 with no raise history', () => {
    expect(getMinRaiseIncrement(createState(), 'player')).toBe(1);
  });

  it('getCallAmount returns max(opponentBet - actorBet, 0)', () => {
    expect(getCallAmount(createState({ playerBet: 3, aiBet: 0 }), 'ai')).toBe(3);
    expect(getCallAmount(createState({ playerBet: 3, aiBet: 5 }), 'player')).toBe(2);
    expect(getCallAmount(createState({ playerBet: 5, aiBet: 5 }), 'player')).toBe(0);
  });
});

describe('betting/defensive validation inside applyBetAction', () => {
  it('rejects illegal action without modifying state', () => {
    const state = createState();
    const result = applyBetAction(state, action('player', 'fold'));
    expect(result).toMatchObject({ ok: false, code: 'no-fold-without-pressure' });
    // 状态字段保持不变。
    expect(state.status).toBe('awaitingPlayer');
  });

  it('rejects action from non-current actor', () => {
    const state = createState({ status: 'awaitingAi' });
    expect(applyBetAction(state, action('player', 'check'))).toMatchObject({
      ok: false,
      code: 'not-current-actor',
    });
  });

  it('rejects action when betting closed', () => {
    const state = createState({ status: 'closed' });
    expect(applyBetAction(state, action('player', 'check'))).toMatchObject({
      ok: false,
      code: 'betting-closed',
    });
  });
});

describe('betting/timeout action', () => {
  it('returns check when call amount is 0', () => {
    const state = createState();
    expect(getTimeoutBetAction(state, 'player')).toStrictEqual({
      ok: true,
      action: { actor: 'player', type: 'check', amount: 0 },
    });
  });

  it('returns fold when call amount > 0 (never auto-call)', () => {
    const state = createState({
      playerBet: 0,
      aiBet: 3,
      status: 'awaitingPlayer',
      lastAggressor: 'ai',
    });
    expect(getTimeoutBetAction(state, 'player')).toStrictEqual({
      ok: true,
      action: { actor: 'player', type: 'fold', amount: 0 },
    });
  });

  it('returns not-current-actor when actor mismatch', () => {
    const state = createState({ status: 'awaitingAi' });
    expect(getTimeoutBetAction(state, 'player')).toStrictEqual({
      ok: false,
      code: 'not-current-actor',
    });
  });
});

describe('betting/raise increment semantics', () => {
  // raise 增量口径 = 本方下注额净增加量，非相对对方的超出量。
  it('player raise from 3 to 9 has increment 6, not 4', () => {
    let s = createState();
    s = nextState(s, action('player', 'bet', 3));
    s = nextState(s, action('ai', 'raise', 5)); // ai 0->5
    // 玩家补到 9 = 增量 6（9-3），min-raise=5，6>=5 合法。
    const result = applyBetAction(s, action('player', 'raise', 6));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.lastRaiseIncrement).toBe(6);
      expect(result.state.playerBet).toBe(9);
    }
    // 玩家试图按「相对对方超出量」= 4（9-5）提交应被接受为增量 4 → 违反 min-raise。
    expect(applyBetAction(s, action('player', 'raise', 4))).toMatchObject({
      ok: false,
      code: 'raise-increment-below-minimum',
    });
  });
});

describe('betting/event payload', () => {
  it('records amountCommitted, previousBet and nextBet', () => {
    let s = createState();
    s = nextState(s, action('player', 'bet', 3));
    const result = applyBetAction(s, action('ai', 'raise', 5));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event).toMatchObject({
        actor: 'ai',
        type: 'raise',
        amountCommitted: 5,
        previousBet: 0,
        nextBet: 5,
      });
    }
  });
});

describe('betting/turn timestamps', () => {
  it('refreshes turnStartedAt when action passes to the next actor', () => {
    const first = applyBetAction(createState(), action('player', 'bet', 3), {
      now: () => 1_000,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    expect(first.state.status).toBe('awaitingAi');
    expect(first.state.turnStartedAt).toBe(1_000);

    const second = applyBetAction(first.state, action('ai', 'raise', 4), {
      now: () => 2_000,
    });
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.state.status).toBe('awaitingPlayer');
      expect(second.state.turnStartedAt).toBe(2_000);
    }
  });

  it('clears turnStartedAt when betting closes', () => {
    const state = createState({
      playerBet: 3,
      aiBet: 0,
      status: 'awaitingAi',
      lastAggressor: 'player',
      turnStartedAt: 1_000,
    });

    const result = applyBetAction(state, action('ai', 'call', 3), {
      now: () => 2_000,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.status).toBe('closed');
      expect(result.state.turnStartedAt).toBeNull();
    }
  });
});

describe('betting/chinese labels', () => {
  it('exposes chinese labels for action types', async () => {
    const { BET_ACTION_TYPE_LABEL, BET_ACTOR_LABEL, BET_STATUS_LABEL } =
      await import('./betting-rules');
    expect(BET_ACTION_TYPE_LABEL.check).toBe('过牌');
    expect(BET_ACTION_TYPE_LABEL.call).toBe('跟注');
    expect(BET_ACTION_TYPE_LABEL.bet).toBe('下注');
    expect(BET_ACTION_TYPE_LABEL.raise).toBe('加注');
    expect(BET_ACTION_TYPE_LABEL.fold).toBe('弃牌');
    expect(BET_ACTION_TYPE_LABEL.allIn).toBe('全下');
    expect(BET_ACTOR_LABEL.player).toBe('玩家');
    expect(BET_ACTOR_LABEL.ai).toBe('AI');
    expect(BET_STATUS_LABEL.closed).toBe('下注已结束');
  });
});
