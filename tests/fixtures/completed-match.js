import { createGame } from '../../game/engine.js';
import { chooseCpuPlay } from '../../game/ai.js';
import { isCompletedRecord } from '../../game/records.js';

export function completedMatch(outcome = 'ai') {
  let seed = 427;
  const random = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const game = createGame({
    random,
    recordId: 'share-fixture',
    opponent: {
      choosePlay: chooseCpuPlay,
      chooseBet: ({ options }) => ({
        action: outcome === 'player' ? 'fold' : options.canCall ? 'call' : 'check',
      }),
    },
  });
  for (let step = 0; step < 150; step++) {
    const s = game.getState();
    if (s.phase === 'summary') break;
    let action;
    if (outcome === 'tie') action = { type: 'elapse', sessionId: s.sessionId, elapsedMs: 99999999 };
    else if (s.phase === 'lower')
      action = { type: 'choose-target', index: s.targetPlayable.findIndex(Boolean) };
    else if (s.phase === 'upper')
      action = s.candidates.length
        ? { type: 'submit-hand', attemptId: s.upper.attemptId, hand: s.candidates[0].hand }
        : { type: 'fail-hand', attemptId: s.upper.attemptId };
    else if (s.phase === 'bet')
      action =
        s.betting.turn === 'ai'
          ? { type: 'cpu-bet', turnId: s.betting.turnId }
          : {
              type: 'bet',
              turnId: s.betting.turnId,
              action: outcome === 'ai' ? 'fold' : s.legalBets.canCall ? 'call' : 'check',
            };
    else if (s.phase === 'showdown') action = { type: 'advance-round' };
    else if (s.phase === 'endurance') action = { type: 'fast-forward', sessionId: s.sessionId };
    if (!action || !game.dispatch(action))
      throw new Error('Fixture could not progress: ' + s.phase);
  }
  const record = game.getRecord();
  if (!isCompletedRecord(record) || record.result.winner !== outcome)
    throw new Error('Fixture did not reach the requested actual result');
  return record;
}
