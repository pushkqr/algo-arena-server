const { create: createRng } = require("../../engine/rng/SeededRNG");
const RoundExecutor = require("./RoundExecutor");
const SiLog = require("../../utils/SiLog");
const {
  throwIfAborted,
  safeCallWithAbort,
  raceWithAbort,
} = require("./EpisodeRunner.async");
const { prepareAgents } = require("./EpisodeRunner.strategy");
const { buildAgentResults } = require("./EpisodeRunner.results");

const DEFAULT_MAX_STEPS = 1000;
const DEFAULT_STEP_TIMEOUT_MS = 50;
const DEFAULT_RESET_TIMEOUT_MS = 200;

/**
 * runEpisode(opts)
 * opts:
 *  - seed
 *  - envFactory
 *  - agents
 *  - maxSteps, stepTimeoutMs, resetTimeoutMs
 *  - abortSignal (optional)
 *  - logger
 */
async function runEpisode(opts = {}) {
  const {
    seed = "default",
    envFactory,
    envOpts = {},
    agents = [],
    maxSteps = DEFAULT_MAX_STEPS,
    stepTimeoutMs = DEFAULT_STEP_TIMEOUT_MS,
    resetTimeoutMs = DEFAULT_RESET_TIMEOUT_MS,
    abortSignal = null,
    logger = SiLog,
  } = opts;

  if (!envFactory || typeof envFactory !== "function") {
    throw new Error("envFactory(seed) is required");
  }

  throwIfAborted(abortSignal);

  const resolvedEnvOpts =
    envOpts && typeof envOpts === "object" && !Array.isArray(envOpts)
      ? envOpts
      : {};

  const env = envFactory(seed, resolvedEnvOpts);
  const prepared = await prepareAgents(agents);

  const runnerAgents = prepared.map((p) => ({
    id: p.id,
    strategy: p.strategy || null,
    _failed: !!p.loadError,
    _loadError: p.loadError || null,
    _return: 0,
    _startingBudget: Infinity,
    ownerId: p.ownerId || null,
  }));

  const rng = createRng(String(seed));
  const loadErrors = runnerAgents
    .map((a) => (a._loadError ? { id: a.id, error: a._loadError } : null))
    .filter(Boolean);

  // reset phase with abort-aware timeouts
  for (const a of runnerAgents) {
    throwIfAborted(abortSignal);
    if (a._failed) continue;
    const agentRng = rng.derive(`reset:${a.id}`);
    const rngFn = () => agentRng.random();
    try {
      if (a.strategy && typeof a.strategy.reset === "function") {
        await safeCallWithAbort(
          a.strategy.reset(rngFn),
          resetTimeoutMs,
          abortSignal,
        );
      }
      a._failed = false;
      a._return = 0;
    } catch (err) {
      if (err && err.name === "AbortError") throw err;
      logger.Message &&
        logger.Message(
          `Agent ${a.id} failed during reset: ${err && err.message}`,
        );
      a._failed = true;
      a._resetError = err && err.message;
      loadErrors.push({ id: a.id, error: `reset: ${err && err.message}` });
    }
  }

  const initial = await Promise.resolve(env.reset ? env.reset() : env.reset);
  let observations = initial || {};

  // determine per-agent starting budgets (prefer initial observation, fall back to env.opts.defaultBudget)
  for (const a of runnerAgents) {
    const obs = observations && observations[a.id];
    if (
      obs &&
      obs.startingBudget !== undefined &&
      Number.isFinite(Number(obs.startingBudget))
    ) {
      a._startingBudget = Number(obs.startingBudget);
    } else if (
      env &&
      env.opts &&
      Number.isFinite(Number(env.opts.defaultBudget))
    ) {
      a._startingBudget = Number(env.opts.defaultBudget);
    } else {
      a._startingBudget = Infinity;
    }
  }

  let step = 0;
  let done = false;
  const roundsMeta = [];
  let lastInfo = null;

  while (!done && step < maxSteps) {
    throwIfAborted(abortSignal);

    const actions = {};

    await Promise.all(
      runnerAgents.map(async (a) => {
        if (a._failed) {
          actions[a.id] = null;
          return;
        }
        const agentRng = rng.derive(`step:${step}:agent:${a.id}`);
        const rngFn = () => agentRng.random();
        try {
          const obs = observations[a.id];
          const actRes =
            a.strategy && typeof a.strategy.act === "function"
              ? a.strategy.act(obs, rngFn)
              : null;
          const action = await safeCallWithAbort(
            actRes,
            stepTimeoutMs,
            abortSignal,
          );
          actions[a.id] = action;
        } catch (err) {
          if (err && err.name === "AbortError") throw err;
          logger.Message &&
            logger.Message(
              `Agent ${a.id} failed at step ${step}: ${err && err.message}`,
            );
          a._failed = true;
          a._actError = err && err.message;
          actions[a.id] = null;
          loadErrors.push({ id: a.id, error: `act: ${err && err.message}` });
        }
      }),
    );

    // run env step via RoundExecutor (race with abort)
    const roundTimeout = Math.max(200, stepTimeoutMs * 5);
    const roundPromise = RoundExecutor.runRound({
      env,
      actions,
      timeoutMs: roundTimeout,
      logger,
    });
    let runRoundRes;
    try {
      runRoundRes = await raceWithAbort(roundPromise, abortSignal);
    } catch (err) {
      if (err && err.name === "AbortError") throw err;
      // treat environment error as aborting episode
      logger.Error &&
        logger.Error(`Environment step failed/aborted: ${err && err.message}`);
      for (const a of runnerAgents) if (!a._failed) a._failed = true;
      break;
    }

    const {
      observations: stepObservations,
      rewards,
      done: stepDone,
      info,
      roundMeta,
    } = runRoundRes || {};
    observations = stepObservations || {};
    done = Boolean(stepDone);
    lastInfo = info || lastInfo;

    for (const a of runnerAgents) {
      const r = rewards && rewards[a.id];
      if (!a._failed && typeof r === "number") {
        a._return = (a._return || 0) + r;
      }
    }

    roundsMeta.push(roundMeta || { durationMs: 0, error: null });

    if (roundMeta && roundMeta.error) {
      for (const a of runnerAgents) if (!a._failed) a._failed = true;
      break;
    }

    step += 1;
  }

  // Build agentResults and include budget/wealth metadata when available
  const finalObservations = observations || {};
  const finalInfo = lastInfo || {};
  const agentResults = buildAgentResults(
    runnerAgents,
    finalObservations,
    finalInfo,
  );

  const episodeMeta = {
    seed,
    steps: step,
    loadErrors,
    rounds: roundsMeta,
    info: finalInfo,
  };

  return { agentResults, episodeMeta };
}

module.exports = {
  runEpisode,
};
