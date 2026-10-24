// Browser scheduling only. The engine validates every callback's turnId.
export function createTurnClock({
  now = () => performance.now(),
  schedule = setTimeout,
  cancel = clearTimeout,
  seconds = 30,
  cpuDelay = 600,
  onTick = () => {},
  onPlayerTimeout,
  onCpuTurn,
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
    onTick(turn.actor === 'player' ? Math.ceil(remaining / 1000) : null);
    if (remaining > 0) {
      later(turn, turn.actor === 'player' ? Math.min(250, remaining) : remaining);
      return;
    }
    turn.done = true;
    if (turn.actor === 'player') onPlayerTimeout(turn.id);
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
      const betting = snapshot.phase === 'bet' ? snapshot.betting : null;
      if (!betting?.turn) {
        clear();
        return;
      }
      if (active?.id === betting.turnId) {
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
        deadline: now() + (betting.turn === 'player' ? seconds * 1000 : cpuDelay),
        done: false,
      };
      run(active);
    },
  };
}
