const EventEmitter = require("events");
const EvaluationService = require("../domain/evaluation/EvaluationService");

function noop() {}

function createEngine(opts = {}) {
  const { maxConcurrent = 1, persistence = {}, logger = console } = opts;

  const saveEvaluation = persistence.saveEvaluation || noop;
  const saveProgress = persistence.saveProgress || noop;

  const emitter = new EventEmitter();
  const queue = [];
  let active = 0;
  let nextId = 1;
  const runs = new Map();

  function _runNext() {
    if (active >= maxConcurrent) return;
    const item = queue.shift();
    if (!item) return;
    active += 1;
    _execute(item).finally(() => {
      active -= 1;
      _runNext();
    });
  }

  async function _execute({ evaluationId, config, resolve, reject }) {
    emitter.emit("start", evaluationId, config);
    const ctrl = { cancelled: false, abortController: new AbortController() };
    runs.get(evaluationId).controller = ctrl;

    const runnerPromise = (async () => {
      try {
        const result = await EvaluationService.runEvaluation({
          ...config,
          abortSignal: ctrl.abortController.signal,
        });
        if (ctrl.cancelled) {
          emitter.emit("cancelled", evaluationId);
          reject(new Error("cancelled"));
          return;
        }
        try {
          await Promise.resolve(saveEvaluation(result));
        } catch (err) {
          logger.warn && logger.warn("persistence.saveEvaluation failed", err);
        }
        emitter.emit("done", evaluationId, result);
        resolve(result);
        return result;
      } catch (err) {
        if (ctrl.cancelled) {
          emitter.emit("cancelled", evaluationId);
          reject(new Error("cancelled"));
          return;
        }
        emitter.emit("error", evaluationId, err);
        reject(err);
        return;
      } finally {
        runs.delete(evaluationId);
      }
    })();

    runs.get(evaluationId).promise = runnerPromise;
    return runnerPromise;
  }

  function startEvaluation(config) {
    const evaluationId = String(config.evaluationId || `eval-${nextId++}`);
    const p = new Promise((resolve, reject) => {
      queue.push({ evaluationId, config, resolve, reject });
      runs.set(evaluationId, { controller: null, promise: null });
      _runNext();
    });
    runs.get(evaluationId).promise = p;
    emitter.emit("queued", evaluationId, config);
    return { evaluationId, promise: p };
  }

  function cancelEvaluation(evaluationId) {
    const r = runs.get(evaluationId);
    if (!r) return false;
    const qi = queue.findIndex((q) => q.evaluationId === evaluationId);
    if (qi >= 0) {
      const [queuedItem] = queue.splice(qi, 1);
      runs.delete(evaluationId);
      if (queuedItem && typeof queuedItem.reject === "function") {
        queuedItem.reject(new Error("cancelled"));
      }
      emitter.emit("cancelled", evaluationId);
      return true;
    }
    if (r.controller) {
      r.controller.cancelled = true;
      if (
        r.controller.abortController &&
        typeof r.controller.abortController.abort === "function"
      ) {
        r.controller.abortController.abort();
      }
      return true;
    }
    return false;
  }

  function listPending() {
    return queue.map((q) => q.evaluationId);
  }

  function listRunning() {
    return Array.from(runs.keys());
  }

  function on(event, cb) {
    emitter.on(event, cb);
  }

  function shutdown() {
    queue.splice(0);
    for (const [id, r] of runs.entries()) {
      if (r.controller) r.controller.cancelled = true;
    }
  }

  return {
    startEvaluation,
    cancelEvaluation,
    listPending,
    listRunning,
    on,
    shutdown,
    _internals: { queue, runs },
  };
}

module.exports = { createEngine };
