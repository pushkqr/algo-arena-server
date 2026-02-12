const { performance } = require("perf_hooks");
const SiLog = require("../../utils/SiLog");

function timeoutPromise(promise, ms) {
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        reject(new Error("timeout"));
      }
    }, ms);
    Promise.resolve(promise)
      .then((v) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          resolve(v);
        }
      })
      .catch((err) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          reject(err);
        }
      });
  });
}

async function runRound(opts = {}) {
  const { env, actions = {}, timeoutMs = 500, logger = SiLog } = opts;

  if (!env || typeof env.step !== "function") {
    throw new Error("runRound requires an env with a step(actions) function");
  }

  const start = performance.now();
  let raw;
  let stepResult;
  let error = null;

  try {
    raw = await timeoutPromise(Promise.resolve(env.step(actions)), timeoutMs);
    stepResult = raw || {};
  } catch (err) {
    error = err && err.message ? err.message : String(err);
    logger &&
      logger.Message &&
      logger.Message(`RoundExecutor: env.step failed: ${error}`);
    stepResult = { observations: {}, rewards: {}, done: true, info: { error } };
  }

  const durationMs = Math.max(0, performance.now() - start);

  const observations =
    stepResult.observations && typeof stepResult.observations === "object"
      ? stepResult.observations
      : {};
  const rewards =
    stepResult.rewards && typeof stepResult.rewards === "object"
      ? stepResult.rewards
      : {};
  const done = Boolean(stepResult.done);
  const info = stepResult.info !== undefined ? stepResult.info : null;

  for (const id of Object.keys(actions || {})) {
    if (!(id in observations)) observations[id] = observations[id] || null;
    if (!(id in rewards))
      rewards[id] = rewards[id] !== undefined ? rewards[id] : 0;
  }

  const roundMeta = {
    durationMs,
    error,
    raw: raw || null,
  };

  return { observations, rewards, done, info, roundMeta };
}

module.exports = {
  runRound,
};
