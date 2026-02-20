const Envs = require("../../engine/environments");

function throwIfAborted(signal) {
  if (signal && signal.aborted) {
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  }
}

function normalizeConfig(config = {}) {
  const evaluationId = String(config.evaluationId);
  const seed = String(config.seed || "0");
  const rounds = Number(config.rounds) || 10;
  const poolSize = Number(config.poolSize);
  const episodesPerPool = Number(config.episodesPerPool) || 1;
  const shuffle = config.shuffle !== false;
  const rankingOptions = config.rankingOptions || config.ranking || {};
  const envName = config.envName || "";
  const envOpts =
    config.envOpts && typeof config.envOpts === "object" ? config.envOpts : {};
  const userId = config.userId || null;
  const normalizedAgents = (config.agents || []).map((agent) => ({
    ...agent,
    ownerId: agent.ownerId || agent.userId || null,
  }));
  const topEnvFactory =
    config.envFactory ||
    (config.envName ? Envs.getFactory(config.envName) : null);

  return {
    evaluationId,
    seed,
    rounds,
    poolSize,
    episodesPerPool,
    shuffle,
    rankingOptions,
    envName,
    envOpts,
    userId,
    normalizedAgents,
    topEnvFactory,
    poolCountInput: config.poolCount,
  };
}

function resolveEnvFactoryForPool(pool, topEnvFactory) {
  if (pool.envFactory) return pool.envFactory;
  if (pool.envName) return Envs.getFactory(pool.envName);
  return topEnvFactory;
}

function resolveEpisodeEnvOpts(baseEnvOpts, pool, rounds) {
  const episodeEnvOpts = {
    ...(baseEnvOpts && typeof baseEnvOpts === "object" ? baseEnvOpts : {}),
    ...(pool && pool.envOpts && typeof pool.envOpts === "object"
      ? pool.envOpts
      : {}),
  };

  if (episodeEnvOpts.rounds === undefined) {
    episodeEnvOpts.rounds = rounds;
  }

  return episodeEnvOpts;
}

function toEpisodeAgentResult(ar) {
  const id = ar.id || ar.agentId || ar.name;
  const ret =
    "return" in ar
      ? Number(ar.return || 0)
      : "value" in ar
        ? Number(ar.value || 0)
        : "payoff" in ar
          ? Number(ar.payoff || 0)
          : 0;
  const failed = !!ar.failed;
  const startingBudget = Number.isFinite(Number(ar.startingBudget))
    ? Number(ar.startingBudget)
    : null;
  const spent = Number.isFinite(Number(ar.spent)) ? Number(ar.spent) : null;
  const remainingBudget = Number.isFinite(Number(ar.remainingBudget))
    ? Number(ar.remainingBudget)
    : null;
  const wins = Number.isFinite(Number(ar.wins)) ? Number(ar.wins) : null;
  const finalWealth = Number.isFinite(Number(ar.finalWealth))
    ? Number(ar.finalWealth)
    : null;
  const inventoryValue = Number.isFinite(Number(ar.inventoryValue))
    ? Number(ar.inventoryValue)
    : null;

  return {
    id,
    return: ret,
    value: ret,
    failed,
    startingBudget,
    spent,
    remainingBudget,
    wins,
    finalWealth,
    inventoryValue,
  };
}

function getRunnerAgentResults(runnerRes) {
  if (runnerRes && runnerRes.agentResults) {
    return runnerRes.agentResults;
  }
  if (Array.isArray(runnerRes)) {
    return runnerRes;
  }
  if (runnerRes && (runnerRes.results || runnerRes.outcomes)) {
    return runnerRes.results || runnerRes.outcomes;
  }
  return [];
}

function buildFailedEpisodeAgentResult(agent) {
  const id = agent.id || agent.agentId || agent.name;
  return {
    id,
    return: 0,
    value: 0,
    failed: true,
    startingBudget: null,
    spent: null,
    remainingBudget: null,
    wins: null,
    finalWealth: null,
    inventoryValue: null,
  };
}

module.exports = {
  throwIfAborted,
  normalizeConfig,
  resolveEnvFactoryForPool,
  resolveEpisodeEnvOpts,
  toEpisodeAgentResult,
  getRunnerAgentResults,
  buildFailedEpisodeAgentResult,
};
