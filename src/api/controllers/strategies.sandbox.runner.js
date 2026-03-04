const SANDBOX_TIMEOUT_MS = 5000;
const SANDBOX_MEMORY_LIMIT_BYTES = 128 * 1024 * 1024;
const SANDBOX_MAX_STEPS_CAP = 1000;
const SANDBOX_AGENT_ID = "sandbox-agent";
const SANDBOX_DEFAULT_STARTING_BUDGET = 100;

function createSandboxError(code, message, details = {}, cause) {
  const err = new Error(message);
  err.code = code;
  err.details = details;
  if (cause) {
    err.cause = cause;
  }
  return err;
}

function sanitizeTraceEntry(step, observation, action, reward, info) {
  return {
    step,
    observation: observation || null,
    action: action === undefined ? null : action,
    reward: Number.isFinite(Number(reward)) ? Number(reward) : 0,
    info: info && typeof info === "object" ? info : {},
  };
}

function shouldIncludeSummaryTrace(step, maxSteps, done) {
  if (step === 0) return true;
  if (done || step === maxSteps - 1) return true;
  return step % 25 === 0;
}

function ensureMemoryWithinLimit() {
  const heapUsed =
    process && process.memoryUsage ? process.memoryUsage().heapUsed : 0;
  if (heapUsed > SANDBOX_MEMORY_LIMIT_BYTES) {
    throw createSandboxError(
      "RUN_MEMORY_LIMIT",
      "Sandbox run exceeded memory limit",
      { heapUsed, limit: SANDBOX_MEMORY_LIMIT_BYTES },
    );
  }
}

function callStrategyMethodWithTimeout(method, args, timeoutMs, methodName) {
  return Promise.race([
    Promise.resolve().then(() => method(...args)),
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          createSandboxError(
            "RUN_TIMEOUT",
            `strategy ${methodName} timed out`,
            { methodName, timeoutMs },
          ),
        );
      }, timeoutMs);
    }),
  ]);
}

async function runSingleSandboxEpisode({
  strategy,
  envFactory,
  envName,
  seed,
  maxSteps,
  traceMode,
  episodeIndex = 0,
}) {
  const env = envFactory(String(seed), {
    rounds: maxSteps,
    defaultBudget: SANDBOX_DEFAULT_STARTING_BUDGET,
  });
  if (
    !env ||
    typeof env.reset !== "function" ||
    typeof env.step !== "function"
  ) {
    throw createSandboxError(
      "RUN_ENVIRONMENT_INVALID",
      `invalid environment factory for ${envName}`,
      { envName },
    );
  }

  const trace = [];
  const episodeStart = Date.now();

  ensureMemoryWithinLimit();

  if (typeof strategy.reset === "function") {
    try {
      await callStrategyMethodWithTimeout(strategy.reset, [], 200, "reset");
    } catch (err) {
      if (err && err.code === "RUN_TIMEOUT") throw err;
      throw createSandboxError(
        "RUN_STRATEGY_RUNTIME",
        "Strategy reset failed",
        {
          phase: "reset",
          message: err && err.message ? err.message : String(err),
        },
        err,
      );
    }
  }

  let observations = await Promise.resolve(env.reset());
  let totalReturn = 0;
  let lastAction = null;
  let steps = 0;
  let done = false;

  while (!done && steps < maxSteps) {
    ensureMemoryWithinLimit();

    let rawObservation =
      observations && typeof observations === "object"
        ? observations[SANDBOX_AGENT_ID]
        : null;
    if (!rawObservation || typeof rawObservation !== "object") {
      if (envName === "AuctionHouse") {
        const fallbackBudget =
          env && env.opts && Number.isFinite(Number(env.opts.defaultBudget))
            ? Number(env.opts.defaultBudget)
            : SANDBOX_DEFAULT_STARTING_BUDGET;
        rawObservation = {
          remainingBudget: fallbackBudget,
          startingBudget: fallbackBudget,
        };
      } else {
        rawObservation = {};
      }
    }

    let observed = rawObservation;
    if (typeof strategy.observe === "function") {
      try {
        observed = await callStrategyMethodWithTimeout(
          strategy.observe,
          [rawObservation],
          50,
          "observe",
        );
      } catch (err) {
        if (err && err.code === "RUN_TIMEOUT") throw err;
        throw createSandboxError(
          "RUN_STRATEGY_RUNTIME",
          "Strategy observe failed",
          {
            phase: "observe",
            step: steps,
            message: err && err.message ? err.message : String(err),
          },
          err,
        );
      }
    }

    let action;
    try {
      action = await callStrategyMethodWithTimeout(
        strategy.act,
        [observed],
        50,
        "act",
      );
    } catch (err) {
      if (err && err.code === "RUN_TIMEOUT") throw err;
      throw createSandboxError(
        "RUN_STRATEGY_RUNTIME",
        "Strategy act failed",
        {
          phase: "act",
          step: steps,
          message: err && err.message ? err.message : String(err),
        },
        err,
      );
    }

    let stepResult;
    try {
      stepResult = await Promise.resolve(
        env.step({
          [SANDBOX_AGENT_ID]: action,
        }),
      );
    } catch (err) {
      throw createSandboxError(
        "RUN_ENVIRONMENT_RUNTIME",
        "Environment step failed",
        {
          phase: "env.step",
          step: steps,
          message: err && err.message ? err.message : String(err),
        },
        err,
      );
    }

    const rewards =
      stepResult && stepResult.rewards && typeof stepResult.rewards === "object"
        ? stepResult.rewards
        : {};
    const reward = Number(rewards[SANDBOX_AGENT_ID] || 0);
    totalReturn += reward;
    lastAction = action;

    if (traceMode === "full") {
      if (trace.length < SANDBOX_MAX_STEPS_CAP) {
        trace.push(
          sanitizeTraceEntry(
            steps,
            rawObservation,
            action,
            reward,
            stepResult ? stepResult.info : {},
          ),
        );
      }
    } else if (traceMode === "summary") {
      const stepDone = !!(stepResult && stepResult.done);
      if (shouldIncludeSummaryTrace(steps, maxSteps, stepDone)) {
        trace.push(
          sanitizeTraceEntry(
            steps,
            rawObservation,
            action,
            reward,
            stepResult ? stepResult.info : {},
          ),
        );
      }
    }

    done = !!(stepResult && stepResult.done);
    observations =
      stepResult &&
      stepResult.observations &&
      typeof stepResult.observations === "object"
        ? stepResult.observations
        : {};
    steps += 1;
  }

  const durationMs = Date.now() - episodeStart;
  return {
    episodeIndex,
    status: "completed",
    steps,
    metrics: {
      totalReturn,
      averageReturn: steps > 0 ? totalReturn / steps : 0,
      failRate: 0,
    },
    lastAction,
    durationMs,
    trace,
  };
}

async function runSandboxEpisodeWithLimits(options) {
  const executePromise = runSingleSandboxEpisode(options);

  return Promise.race([
    executePromise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          createSandboxError("RUN_TIMEOUT", "Sandbox run exceeded time limit", {
            timeoutMs: SANDBOX_TIMEOUT_MS,
          }),
        );
      }, SANDBOX_TIMEOUT_MS);
    }),
  ]);
}

module.exports = {
  runSandboxEpisodeWithLimits,
};
