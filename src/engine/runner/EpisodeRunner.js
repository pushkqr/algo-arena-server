const fs = require("fs");
const path = require("path");
const { create: createRng } = require("../../engine/rng/SeededRNG");
const StrategyLoader = require("../../domain/strategy/StrategyLoader");
const RoundExecutor = require("./RoundExecutor");
const SiLog = require("../../utils/SiLog");

const DEFAULT_MAX_STEPS = 1000;
const DEFAULT_STEP_TIMEOUT_MS = 50;
const DEFAULT_RESET_TIMEOUT_MS = 200;

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

function raceWithAbort(promise, signal) {
  if (!signal) return Promise.resolve(promise);
  if (signal.aborted) {
    const err = new Error("aborted");
    err.name = "AbortError";
    return Promise.reject(err);
  }
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      reject(err);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    Promise.resolve(promise)
      .then((v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      })
      .catch((err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      });
  });
}

async function safeCallWithAbort(fnPromiseLike, timeoutMs, signal) {
  return raceWithAbort(
    timeoutPromise(Promise.resolve(fnPromiseLike), timeoutMs),
    signal,
  );
}

const strategyCache = new Map();
function cacheKeyForAgentSpec(spec) {
  if (spec.path) return `path:${spec.path}`;
  const src = String(spec.source || spec.code || "");
  return `src:${Buffer.from(src).toString("base64").slice(0, 40)}`;
}

function loadStrategyFromSpec(spec) {
  const id = spec.id || spec.agentId || spec.name || "<anon>";
  try {
    let code;
    let name = spec.name || id;
    if (spec.path) {
      const filePath = spec.path;
      code = fs.readFileSync(filePath, "utf8");
      name = name || path.basename(filePath, path.extname(filePath));
    } else {
      code = spec.source || spec.code || "";
    }
    if (!code) return { module: null, error: new Error("no code provided") };
    const loaded = StrategyLoader.loadStrategy({ name, code });
    if (loaded && loaded.module && typeof loaded.module.act === "function") {
      return { module: loaded.module, error: null };
    }
    return {
      module: null,
      error:
        loaded && loaded.error ? loaded.error : new Error("invalid strategy"),
    };
  } catch (err) {
    return { module: null, error: err };
  }
}

async function prepareAgents(agentsSpec = []) {
  const prepared = [];
  for (const spec of agentsSpec) {
    const id = spec.id || spec.agentId || spec.name;
    const ownerId = spec.ownerId || spec.userId || null;
    const key = cacheKeyForAgentSpec(spec);
    if (strategyCache.has(key)) {
      prepared.push({ id, strategy: strategyCache.get(key), ownerId });
      continue;
    }
    const { module, error } = loadStrategyFromSpec(spec);
    if (module) {
      strategyCache.set(key, module);
      prepared.push({ id, strategy: module, ownerId });
    } else {
      prepared.push({
        id,
        strategy: null,
        loadError: error && error.message ? error.message : String(error),
        ownerId,
      });
    }
  }
  return prepared;
}

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

  if (abortSignal && abortSignal.aborted) {
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  }

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
    if (abortSignal && abortSignal.aborted) {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }
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
    if (abortSignal && abortSignal.aborted) {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    }

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

  const agentResults = runnerAgents.map((a) => {
    const spent =
      finalInfo &&
      finalInfo.spent &&
      Number.isFinite(Number(finalInfo.spent[a.id]))
        ? Number(finalInfo.spent[a.id])
        : finalObservations[a.id] &&
            Number.isFinite(Number(finalObservations[a.id].mySpend))
          ? Number(finalObservations[a.id].mySpend)
          : 0;

    const wins =
      finalInfo &&
      finalInfo.wins &&
      Number.isFinite(Number(finalInfo.wins[a.id]))
        ? Number(finalInfo.wins[a.id])
        : finalObservations[a.id] &&
            Number.isFinite(Number(finalObservations[a.id].myWins))
          ? Number(finalObservations[a.id].myWins)
          : 0;

    const startingBudget = Number.isFinite(Number(a._startingBudget))
      ? Number(a._startingBudget)
      : null;

    const obsRemaining =
      finalObservations[a.id] &&
      Number.isFinite(Number(finalObservations[a.id].remainingBudget))
        ? Number(finalObservations[a.id].remainingBudget)
        : null;
    const infoBudget =
      finalInfo &&
      finalInfo.budgets &&
      Number.isFinite(Number(finalInfo.budgets[a.id]))
        ? Number(finalInfo.budgets[a.id])
        : null;
    const inventoryValue =
      finalInfo &&
      finalInfo.inventoryValue &&
      Number.isFinite(Number(finalInfo.inventoryValue[a.id]))
        ? Number(finalInfo.inventoryValue[a.id])
        : 0;

    const remainingBudget =
      infoBudget !== null
        ? infoBudget
        : obsRemaining !== null
          ? obsRemaining
          : startingBudget !== null && Number.isFinite(startingBudget)
            ? Math.max(0, startingBudget - spent)
            : null;

    const finalWealth =
      remainingBudget !== null
        ? remainingBudget + inventoryValue
        : startingBudget !== null && Number.isFinite(startingBudget)
          ? startingBudget + (a._return || 0) - spent
          : null;

    return {
      id: a.id,
      ownerId: a.ownerId || null,
      return: typeof a._return === "number" ? a._return : 0,
      failed: Boolean(a._failed),
      loadError: a._loadError || null,
      resetError: a._resetError || null,
      actError: a._actError || null,
      // budget/wealth metadata (optional; may be null when not applicable)
      startingBudget,
      spent,
      remainingBudget,
      wins,
      inventoryValue,
      finalWealth,
    };
  });

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
