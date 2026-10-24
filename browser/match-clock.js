// Sends absolute elapsed time; the engine owns supply, spending and outcomes.
export function createMatchClock({
  now = () => performance.now(),
  schedule = setTimeout,
  cancel = clearTimeout,
  onPulse,
}) {
  let session = null;
  let origin = 0;
  let handle = null;
  let ticket = 0;
  let suspended = false;
  function stop() {
    ticket++;
    if (handle !== null) cancel(handle);
    handle = null;
  }
  function flush() {
    if (session === null || suspended) return;
    onPulse({
      type: 'elapse',
      sessionId: session,
      elapsedMs: Math.max(0, Math.floor(now() - origin)),
    });
  }
  function run() {
    const issued = ++ticket;
    handle = schedule(() => {
      if (issued !== ticket || suspended || session === null) return;
      handle = null;
      flush();
      if (issued === ticket && session !== null) run();
    }, 250);
  }
  return {
    flush,
    clear() {
      stop();
      session = null;
      suspended = false;
    },
    suspend() {
      stop();
      suspended = true;
    },
    sync(snapshot) {
      if (snapshot.phase === 'summary') {
        this.clear();
        return;
      }
      if (session !== snapshot.sessionId) {
        stop();
        session = snapshot.sessionId;
        origin = now() - snapshot.respiration.elapsedMs;
        suspended = false;
        run();
      } else if (suspended) {
        suspended = false;
        flush();
        if (session !== null) run();
      }
    },
  };
}
