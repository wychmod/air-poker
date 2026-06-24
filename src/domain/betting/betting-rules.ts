// BettingEngine 核心类型与中文展示名。
//
// 本模块只承载 V1 多轮下注的纯数据结构与展示文案，不包含任何业务计算。
// 业务规则统一放在 `betting-engine.ts`。详见
// `doc/v1-implementation-design/05-betting-engine.md`。

export type BetActor = 'player' | 'ai';

// V1 下注动作类型。check / call / bet / raise / fold / allIn。
export type BetActionType = 'check' | 'call' | 'bet' | 'raise' | 'fold' | 'allIn';

export type BetStatus = 'awaitingPlayer' | 'awaitingAi' | 'closed';

// 单个下注动作。amount 为本次动作实际投入的 Air；check / fold 时为 0。
export type BetAction = {
  actor: BetActor;
  type: BetActionType;
  amount: number;
};

// V1 下注阶段状态。详见 05 文档「核心类型」段。
export type BetState = {
  playerBet: number;
  aiBet: number;
  playerAvailableAir: number;
  aiAvailableAir: number;
  status: BetStatus;
  lastAggressor: BetActor | null;
  lastRaiseIncrement: number;
  raiseCount: number;
  turnStartedAt: number | null;
};

// 合法动作的展示条目，供 UI 按钮启用状态与 AI 决策裁剪使用。
export type LegalBetAction = {
  type: BetActionType;
  minAmount: number;
  maxAmount: number;
  // 不合法但 UI 需要展示的动作附带原因码，对应 errors.md §5。
  disabledReason?: string;
};

export type BetValidationResult =
  | { ok: true; normalizedAction: BetAction }
  | { ok: false; code: string; legalActions: LegalBetAction[] };

export type ApplyBetActionResult =
  | { ok: true; state: BetState; event: BetActionEvent }
  | { ok: false; code: string; legalActions: LegalBetAction[] };

// 回合记录用事件。amountCommitted 为本次动作实际投入额，
// previousBet / nextBet 均为该 actor 的累计下注额。
export type BetActionEvent = {
  actor: BetActor;
  type: BetActionType;
  amountCommitted: number;
  previousBet: number;
  nextBet: number;
};

// 每个德州动作的中文展示名。UI 层统一从这里取展示文案，不散落硬编码。
export const BET_ACTION_TYPE_LABEL: Record<BetActionType, string> = {
  check: '过牌',
  call: '跟注',
  bet: '下注',
  raise: '加注',
  fold: '弃牌',
  allIn: '全下',
};

// 行动方的中文展示名。
export const BET_ACTOR_LABEL: Record<BetActor, string> = {
  player: '玩家',
  ai: 'AI',
};

// Bet 状态的中文展示名。
export const BET_STATUS_LABEL: Record<BetStatus, string> = {
  awaitingPlayer: '等待玩家行动',
  awaitingAi: '等待 AI 行动',
  closed: '下注已结束',
};
