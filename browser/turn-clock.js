// Browser scheduling only. The engine validates every callback's turnId.
export function createTurnClock({
  now = () => performance.now(),
  schedule = setTimeout,
  cancel = clearTimeout,
  seconds = 30,
  cpuDelay = 600,
  upperSeconds = 60,
  onTick = () => {},
  onPlayerTimeout,
  onCpuTurn,
  onUpperTimeout,
}) {
  let active = null;
  let handle = null;
  let ticket = 0;
  let suspended = false;
  function stop() {
    ticket++;
    if (handle !== null) cancel(handle);
    handle = null;
  }
  function later(turn, delay) {
    const issued = ++ticket;
    handle = schedule(() => {
      if (issued !== ticket) return;
      handle = null;
      run(turn);
    }, delay);
  }
  function run(turn) {
    if (active !== turn || suspended || turn.done) return;
    const remaining = Math.max(0, turn.deadline - now());
    onTick(turn.actor === 'ai' ? null : Math.ceil(remaining / 1000));
    if (remaining > 0) {
      later(turn, turn.actor === 'ai' ? remaining : Math.min(250, remaining));
      return;
    }
    turn.done = true;
    if (turn.actor === 'upper') onUpperTimeout(turn.id);
    else if (turn.actor === 'player') onPlayerTimeout(turn.id);
    else onCpuTurn(turn.id);
  }
  function clear() {
    stop();
    active = null;
    suspended = false;
  }
  return {
    clear,
    suspend() {
      stop();
      suspended = true;
    },
    sync(snapshot) {
      const betting =
        snapshot.phase === 'upper'
          ? {
              turn: 'upper',
              turnId: snapshot.upper.attemptId,
              deadlineMs: snapshot.upper.deadlineMs,
            }
          : snapshot.phase === 'bet'
            ? snapshot.betting
            : null;
      if (!betting?.turn) {
        clear();
        return;
      }
      if (active?.id === betting.turnId && active.actor === betting.turn) {
        if (suspended) {
          suspended = false;
          run(active);
        }
        return;
      }
      stop();
      suspended = false;
      active = {
        id: betting.turnId,
        actor: betting.turn,
        deadline:
          now() +
          (Number.isFinite(betting.deadlineMs)
            ? Math.max(0, betting.deadlineMs - snapshot.respiration.elapsedMs)
            : betting.turn === 'upper'
              ? upperSeconds * 1000
              : betting.turn === 'player'
                ? seconds * 1000
                : cpuDelay),
        done: false,
      };
      run(active);
    },
  };
}
