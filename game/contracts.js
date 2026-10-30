export const CONTRACT_IDS = Object.freeze(['none', 'no-fold', 'comeback', 'perfect']);
export const DEFAULT_CONTRACT = 'none';

export const isContractId = (value) => CONTRACT_IDS.includes(value);

const playerFolds = (record) =>
  (record.rounds ?? []).flatMap((round) =>
    (round.actions ?? []).filter((action) => action.actor === 'player' && action.action === 'fold'),
  );

const settledRounds = (record) =>
  (record.rounds ?? []).filter((round) => round.status === 'settled' && round.settlement);

const endingAir = (round, actor) => {
  if (!round?.airBefore || !round?.totals?.[actor]) return null;
  return round.airBefore[actor] + round.totals[actor].net;
};

export function evaluateContract(record, requested = record?.mode?.contract) {
  const id = isContractId(requested) ? requested : DEFAULT_CONTRACT;
  if (id === 'none' || !record?.result || record.status !== 'completed') return null;
  const won = record.result.winner === 'player';
  const rounds = settledRounds(record);

  if (id === 'no-fold') {
    const folds = playerFolds(record).length;
    return { id, complete: won && folds === 0, stats: { folds } };
  }

  if (id === 'comeback') {
    let largestDeficit = 0;
    for (const round of rounds) {
      const player = endingAir(round, 'player');
      const ai = endingAir(round, 'ai');
      if (Number.isFinite(player) && Number.isFinite(ai))
        largestDeficit = Math.max(largestDeficit, ai - player);
    }
    return { id, complete: won && largestDeficit > 0, stats: { largestDeficit } };
  }

  const roundsWon = rounds.filter((round) => round.settlement.winner === 'player').length;
  return {
    id,
    complete: won && rounds.length > 0 && roundsWon === rounds.length,
    stats: { roundsWon, settledRounds: rounds.length },
  };
}
