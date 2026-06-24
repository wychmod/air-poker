// V1 多轮下注引擎。详见 `doc/v1-implementation-design/05-betting-engine.md`。
//
// BettingEngine 只关心 Air、下注额、行动方和阶段约束，不读取牌型、AI 评分
// 或完整 GameState。所有金额使用整数 Air，不允许小数。

import {
  type ApplyBetActionResult,
  type BetAction,
  type BetActionEvent,
  type BetActor,
  type BetState,
  type BetValidationResult,
  type LegalBetAction,
} from './betting-rules';
import { createAppError } from '../errors';

type ApplyBetActionOptions = {
  now?: () => number;
};

// ---------- 基础工具 ----------

function isNonNegativeInteger(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

function opponentOf(actor: BetActor): BetActor {
  return actor === 'player' ? 'ai' : 'player';
}

function actorBet(state: BetState, actor: BetActor): number {
  return actor === 'player' ? state.playerBet : state.aiBet;
}

function actorAvailableAir(state: BetState, actor: BetActor): number {
  return actor === 'player' ? state.playerAvailableAir : state.aiAvailableAir;
}

function currentActorOf(status: BetState['status']): BetActor | null {
  if (status === 'awaitingPlayer') {
    return 'player';
  }
  if (status === 'awaitingAi') {
    return 'ai';
  }
  return null;
}

// ---------- 创建初始状态 ----------

export function createInitialBetState(input: {
  playerAvailableAir: number;
  aiAvailableAir: number;
}): BetState {
  const { playerAvailableAir, aiAvailableAir } = input;

  if (
    !isNonNegativeInteger(playerAvailableAir) ||
    !isNonNegativeInteger(aiAvailableAir)
  ) {
    throw createAppError('invalid-available-air', 'Air 为负数或非整数', {
      details: { playerAvailableAir, aiAvailableAir },
    });
  }

  return {
    playerBet: 0,
    aiBet: 0,
    playerAvailableAir,
    aiAvailableAir,
    status: 'awaitingPlayer',
    lastAggressor: null,
    lastRaiseIncrement: 0,
    raiseCount: 0,
    // 由调用方在进入 awaitingPlayer 时写入 Date.now()。
    turnStartedAt: null,
  };
}

// ---------- 金额计算 ----------

// 当前行动方需要补齐的 call 金额 = max(opponentBet - actorBet, 0)。
export function getCallAmount(state: BetState, actor: BetActor): number {
  const opponentBet = actorBet(state, opponentOf(actor));
  const currentBet = actorBet(state, actor);
  return Math.max(opponentBet - currentBet, 0);
}

// 本回合单方累计下注上限。
export function getTotalBetLimit(state: BetState): number {
  return Math.min(
    state.playerAvailableAir + state.playerBet,
    state.aiAvailableAir + state.aiBet,
  );
}

// 是否处于首注阶段（场上 Bet 总额为 0）。
function isInitialBetPhase(state: BetState): boolean {
  return state.playerBet === 0 && state.aiBet === 0;
}

// 是否已发生 all-in（lastAggressor 的累计下注已达到 totalBetLimit）。
// all-in 后轮到对方时，对方只能 call / fold。
//
// 原理：all-in 把本方「剩余可下注 Air + 已下注」全部投入，而 totalBetLimit 正是
// 双方容量的较小值。无论 all-in 是否被较低 Air 方截断，lastAggressor 的累计下注
// 最终都等于 totalBetLimit，故以此为判定信号。
function hasAllInOccurred(state: BetState): boolean {
  if (state.lastAggressor === null) {
    return false;
  }
  const aggressorBet = actorBet(state, state.lastAggressor);
  return aggressorBet > 0 && aggressorBet === getTotalBetLimit(state);
}

// 首注阶段 bet 的最大金额 = totalBetLimit - actorBet（首注阶段 actorBet = 0）。
export function getMaxBetAmount(state: BetState, actor: BetActor): number {
  if (!isInitialBetPhase(state)) {
    return 0;
  }
  return Math.max(getTotalBetLimit(state) - actorBet(state, actor), 0);
}

// 当前行动方本次 raise 的最小增量（德州 min-raise）。
// actor 参数保留以匹配文档 API 契约；min-raise 仅依赖 lastRaiseIncrement。
export function getMinRaiseIncrement(state: BetState, actor?: BetActor): number {
  void actor;
  return state.lastRaiseIncrement > 0 ? state.lastRaiseIncrement : 1;
}

function getMinRaiseAmount(state: BetState, actor: BetActor): number {
  const minRaiseIncrement = getMinRaiseIncrement(state, actor);
  const pressureToBeat = getCallAmount(state, actor) + 1;
  return Math.max(minRaiseIncrement, pressureToBeat);
}

// 当前行动方本次 raise 的增量上限。
export function getMaxRaiseAmount(state: BetState, actor: BetActor): number {
  // 首注阶段 raise 非法，走 bet 路径。
  if (isInitialBetPhase(state)) {
    return 0;
  }
  // 对方 all-in 后本方只能 call / fold，不能再 raise。
  if (hasAllInOccurred(state)) {
    return 0;
  }

  const totalBetLimit = getTotalBetLimit(state);
  const currentBet = actorBet(state, actor);
  const availableAir = actorAvailableAir(state, actor);
  const maxRaise = Math.min(availableAir, totalBetLimit - currentBet);

  // 结果小于最小有效 raise 金额时普通 raise 不合法，返回 0（仍可 call / fold / allIn）。
  const minRaise = getMinRaiseAmount(state, actor);
  return maxRaise < minRaise ? 0 : Math.max(maxRaise, 0);
}

// ---------- 合法动作生成 ----------

function buildDisabledAction(
  type: LegalBetAction['type'],
  reason: string,
): LegalBetAction {
  return { type, minAmount: 0, maxAmount: 0, disabledReason: reason };
}

export function getLegalBetActions(state: BetState, actor: BetActor): LegalBetAction[] {
  // 状态已关闭：返回空数组。
  if (state.status === 'closed') {
    return [];
  }

  const actions: LegalBetAction[] = [];

  // actor 不是当前行动方：返回与动作集合一致的 disabled 列表。
  const notCurrentActor = currentActorOf(state.status) !== actor;
  if (notCurrentActor) {
    for (const type of ['check', 'call', 'bet', 'raise', 'fold', 'allIn'] as const) {
      actions.push(buildDisabledAction(type, 'not-current-actor'));
    }
    return actions;
  }

  const callAmount = getCallAmount(state, actor);
  const availableAir = actorAvailableAir(state, actor);
  const initialPhase = isInitialBetPhase(state);
  const allInOccurred = hasAllInOccurred(state);

  // all-in 后轮到对方：只能 call / fold。
  if (allInOccurred) {
    // call：跟到 totalBetLimit 截断。call 金额可能因 Air 不足被截断。
    if (callAmount > 0 && availableAir > 0) {
      const cappedCall = Math.min(callAmount, availableAir);
      actions.push({ type: 'call', minAmount: cappedCall, maxAmount: cappedCall });
    } else {
      actions.push(buildDisabledAction('call', 'insufficient-air'));
    }
    actions.push({ type: 'fold', minAmount: 0, maxAmount: 0 });
    // 其余动作非法。
    actions.push(buildDisabledAction('check', 'action-not-legal'));
    actions.push(buildDisabledAction('bet', 'action-not-legal'));
    actions.push(buildDisabledAction('raise', 'action-not-legal'));
    actions.push(buildDisabledAction('allIn', 'action-not-legal'));
    return actions;
  }

  // 首注阶段：check / bet 合法；raise 非法；fold 无压力禁用。
  if (initialPhase) {
    actions.push({ type: 'check', minAmount: 0, maxAmount: 0 });

    const maxBet = getMaxBetAmount(state, actor);
    if (maxBet >= 1 && availableAir >= 1) {
      actions.push({ type: 'bet', minAmount: 1, maxAmount: maxBet });
    } else {
      actions.push(buildDisabledAction('bet', 'insufficient-air'));
    }

    actions.push(buildDisabledAction('raise', 'action-not-legal'));
    actions.push(buildDisabledAction('fold', 'no-fold-without-pressure'));

    // all-in 在首注阶段也允许（首注 all-in 受 totalBetLimit 截断）。
    if (availableAir > 0) {
      const maxAllIn = Math.min(
        availableAir,
        getTotalBetLimit(state) - actorBet(state, actor),
      );
      if (maxAllIn > 0) {
        actions.push({ type: 'allIn', minAmount: maxAllIn, maxAmount: maxAllIn });
      } else {
        actions.push(buildDisabledAction('allIn', 'insufficient-air'));
      }
    } else {
      actions.push(buildDisabledAction('allIn', 'insufficient-air'));
    }
    return actions;
  }

  // 已有下注阶段：call / raise / fold / allIn 合法；bet 非法；check 仅在无压力时合法。
  // check：仅当双方下注相等。
  if (callAmount === 0) {
    actions.push({ type: 'check', minAmount: 0, maxAmount: 0 });
  } else {
    actions.push(buildDisabledAction('check', 'action-not-legal'));
  }

  // call：补齐到对方下注额。Air 不足以完整 call 时 call 不合法（改用 allIn / fold）。
  if (callAmount > 0) {
    if (availableAir >= callAmount) {
      actions.push({
        type: 'call',
        minAmount: callAmount,
        maxAmount: callAmount,
      });
    } else {
      actions.push(buildDisabledAction('call', 'insufficient-air'));
    }
  } else {
    actions.push(buildDisabledAction('call', 'action-not-legal'));
  }

  // bet 在已有下注阶段非法。
  actions.push(buildDisabledAction('bet', 'action-not-legal'));

  // raise：至少覆盖跟注压力并超过对手下注，同时满足 min-raise。
  const minRaise = getMinRaiseAmount(state, actor);
  const maxRaise = getMaxRaiseAmount(state, actor);
  if (maxRaise >= minRaise && maxRaise > 0) {
    actions.push({ type: 'raise', minAmount: minRaise, maxAmount: maxRaise });
  } else {
    actions.push(buildDisabledAction('raise', 'action-not-legal'));
  }

  // fold：面对下注压力时合法。
  actions.push({ type: 'fold', minAmount: 0, maxAmount: 0 });

  // allIn：剩余可下注 Air 大于 0。
  if (availableAir > 0) {
    const maxAllIn = Math.min(
      availableAir,
      getTotalBetLimit(state) - actorBet(state, actor),
    );
    if (maxAllIn > 0) {
      actions.push({ type: 'allIn', minAmount: maxAllIn, maxAmount: maxAllIn });
    } else {
      actions.push(buildDisabledAction('allIn', 'insufficient-air'));
    }
  } else {
    actions.push(buildDisabledAction('allIn', 'insufficient-air'));
  }

  return actions;
}

// ---------- 校验 ----------

function findLegalAction(
  legalActions: LegalBetAction[],
  type: BetAction['type'],
): LegalBetAction | undefined {
  return legalActions.find((action) => action.type === type);
}

function fail(code: string, legalActions: LegalBetAction[]): BetValidationResult {
  return { ok: false, code, legalActions };
}

export function validateBetAction(
  state: BetState,
  action: BetAction,
): BetValidationResult {
  // 状态已关闭。
  if (state.status === 'closed') {
    return fail('betting-closed', []);
  }

  const legalActions = getLegalBetActions(state, action.actor);

  // actor 不是当前行动方。
  if (currentActorOf(state.status) !== action.actor) {
    return fail('not-current-actor', legalActions);
  }

  // amount 必须是非负整数。
  if (!Number.isInteger(action.amount) || action.amount < 0) {
    return fail('invalid-amount', legalActions);
  }

  const legal = findLegalAction(legalActions, action.type);

  // 动作类型不在合法列表（含 disabledReason）。
  if (legal === undefined) {
    return fail('action-not-legal', legalActions);
  }

  // 若动作被 disabled，返回其 disabledReason。
  if (legal.disabledReason !== undefined) {
    return fail(legal.disabledReason, legalActions);
  }

  const actor = action.actor;
  const availableAir = actorAvailableAir(state, actor);
  const currentBet = actorBet(state, actor);
  const totalBetLimit = getTotalBetLimit(state);

  switch (action.type) {
    case 'check': {
      // check 合法性已在 legalActions 中判定（仅无压力时合法）。
      return { ok: true, normalizedAction: { ...action, amount: 0 } };
    }

    case 'fold': {
      // fold 合法性已在 legalActions 中判定（无压力时禁用）。
      return { ok: true, normalizedAction: { ...action, amount: 0 } };
    }

    case 'call': {
      const callAmount = getCallAmount(state, actor);
      // call 金额由系统决定，不接受玩家自定金额；强制使用 callAmount。
      if (callAmount <= 0) {
        // 双方下注相等时应走 check，不应进入 call 路径。
        return fail('action-not-legal', legalActions);
      }
      if (availableAir < callAmount) {
        return fail('insufficient-air', legalActions);
      }
      return {
        ok: true,
        normalizedAction: { ...action, amount: callAmount },
      };
    }

    case 'bet': {
      if (!isInitialBetPhase(state)) {
        return fail('action-not-legal', legalActions);
      }
      if (action.amount < 1 || action.amount > legal.maxAmount) {
        return fail('invalid-amount', legalActions);
      }
      if (currentBet + action.amount > totalBetLimit) {
        return fail('bet-exceeds-total-limit', legalActions);
      }
      if (action.amount > availableAir) {
        return fail('insufficient-air', legalActions);
      }
      return { ok: true, normalizedAction: action };
    }

    case 'raise': {
      const minRaise = getMinRaiseAmount(state, actor);
      const maxRaise = getMaxRaiseAmount(state, actor);

      if (action.amount < minRaise) {
        return fail('raise-increment-below-minimum', legalActions);
      }
      if (action.amount > maxRaise) {
        return fail('raise-exceeds-limit', legalActions);
      }
      if (currentBet + action.amount > totalBetLimit) {
        return fail('bet-exceeds-total-limit', legalActions);
      }
      if (action.amount > availableAir) {
        return fail('insufficient-air', legalActions);
      }
      return { ok: true, normalizedAction: action };
    }

    case 'allIn': {
      // all-in 实际投入额被 totalBetLimit 截断。
      const maxAllIn = Math.min(availableAir, totalBetLimit - currentBet);
      if (maxAllIn <= 0) {
        return fail('insufficient-air', legalActions);
      }
      return {
        ok: true,
        normalizedAction: { ...action, amount: maxAllIn },
      };
    }

    default:
      return fail('action-not-legal', legalActions);
  }
}

// ---------- 执行 ----------

function buildEvent(
  actor: BetActor,
  type: BetAction['type'],
  amountCommitted: number,
  previousBet: number,
  nextBet: number,
): BetActionEvent {
  return { actor, type, amountCommitted, previousBet, nextBet };
}

// 判断动作后是否收敛（进入 closed）。
function shouldCloseAfter(
  state: BetState,
  actor: BetActor,
  type: BetAction['type'],
  nextActorBet: number,
): boolean {
  if (type === 'fold') {
    return true;
  }
  if (type === 'call' || type === 'check') {
    // call 补齐后双方下注相等；check 仅无压力时合法，双方本就相等。
    const opponentBet = actorBet(state, opponentOf(actor));
    return nextActorBet === opponentBet;
  }
  // bet / raise / allIn 不立即收敛（all-in 后轮到对方）。
  return false;
}

function applyCommittedAmount(
  state: BetState,
  actor: BetActor,
  amount: number,
): BetState {
  if (actor === 'player') {
    return {
      ...state,
      playerBet: state.playerBet + amount,
      playerAvailableAir: state.playerAvailableAir - amount,
    };
  }
  return {
    ...state,
    aiBet: state.aiBet + amount,
    aiAvailableAir: state.aiAvailableAir - amount,
  };
}

export function applyBetAction(
  state: BetState,
  action: BetAction,
  options: ApplyBetActionOptions = {},
): ApplyBetActionResult {
  const validation = validateBetAction(state, action);
  if (!validation.ok) {
    return {
      ok: false,
      code: validation.code,
      legalActions: validation.legalActions,
    };
  }

  const normalized = validation.normalizedAction;
  const actor = normalized.actor;
  const previousBet = actorBet(state, actor);
  const amountCommitted = normalized.amount;

  // 先写入金额变化。
  let nextState = applyCommittedAmount(state, actor, amountCommitted);
  const nextActorBet = previousBet + amountCommitted;

  // 更新 lastAggressor / lastRaiseIncrement / raiseCount。
  switch (normalized.type) {
    case 'bet':
      nextState = {
        ...nextState,
        lastAggressor: actor,
        // bet 不建立 raise 基准，lastRaiseIncrement 不变。
      };
      break;
    case 'raise':
      nextState = {
        ...nextState,
        lastAggressor: actor,
        lastRaiseIncrement: amountCommitted,
        raiseCount: nextState.raiseCount + 1,
      };
      break;
    case 'allIn':
      nextState = {
        ...nextState,
        lastAggressor: actor,
        // all-in 后对方不能再 raise，lastRaiseIncrement 不变。
      };
      break;
    // check / call / fold 不更新上述字段。
    default:
      break;
  }

  // 收敛判定。
  if (shouldCloseAfter(state, actor, normalized.type, nextActorBet)) {
    nextState = { ...nextState, status: 'closed', turnStartedAt: null };
  } else {
    // 不收敛则轮到对方。
    const nextStatus: BetState['status'] =
      actor === 'player' ? 'awaitingAi' : 'awaitingPlayer';
    const now = options.now ?? Date.now;
    nextState = { ...nextState, status: nextStatus, turnStartedAt: now() };
  }

  const event = buildEvent(
    actor,
    normalized.type,
    amountCommitted,
    previousBet,
    nextActorBet,
  );

  return { ok: true, state: nextState, event };
}

// ---------- 超时动作 ----------

export function getTimeoutBetAction(
  state: BetState,
  actor: BetActor,
): { ok: true; action: BetAction } | { ok: false; code: string } {
  if (state.status === 'closed') {
    return { ok: false, code: 'betting-closed' };
  }
  if (currentActorOf(state.status) !== actor) {
    return { ok: false, code: 'not-current-actor' };
  }

  const callAmount = getCallAmount(state, actor);
  // 可 check 时（双方下注相等）返回 check。
  if (callAmount === 0) {
    return { ok: true, action: { actor, type: 'check', amount: 0 } };
  }

  // call 金额 > 0：V1 不替玩家承担风险，返回 fold。
  return { ok: true, action: { actor, type: 'fold', amount: 0 } };
}
