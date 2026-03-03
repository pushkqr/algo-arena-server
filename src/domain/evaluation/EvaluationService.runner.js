const PoolBuilder = require("./PoolBuilder");
const { runEpisode } = require("../../engine/runner/EpisodeRunner");
const SiLog = require("../../utils/SiLog");
const {
  throwIfAborted,
  resolveEnvFactoryForPool,
  resolveEpisodeEnvOpts,
  getRunnerAgentResults,
  toEpisodeAgentResult,
  buildFailedEpisodeAgentResult,
} = require("./EvaluationService.helpers");

function validatePoolsOrThrow(pools, evaluationId) {
  if (!Array.isArray(pools) || pools.length === 0) {
    throw new Error("pool builder produced no pools");
  }

  const seenPoolIds = new Set();
  for (let idx = 0; idx < pools.length; idx += 1) {
    const pool = pools[idx];

    if (!pool || typeof pool !== "object") {
      throw new Error(`invalid pool at index ${idx}`);
    }

    const poolId =
      typeof pool.poolId === "string" && pool.poolId.trim()
        ? pool.poolId.trim()
        : `${evaluationId}:pool:${idx}`;

    if (seenPoolIds.has(poolId)) {
      throw new Error(`duplicate poolId '${poolId}' returned by pool builder`);
    }
    seenPoolIds.add(poolId);
    pool.poolId = poolId;

    if (!Array.isArray(pool.agents) || pool.agents.length === 0) {
      throw new Error(`pool '${poolId}' has no agents`);
    }

    for (const agent of pool.agents) {
      if (!agent || typeof agent !== "object") {
        throw new Error(`pool '${poolId}' contains invalid agent entry`);
      }
      const id = agent.id || agent.agentId || agent.name;
      if (typeof id !== "string" || !id.trim()) {
        throw new Error(`pool '${poolId}' contains agent without id`);
      }
    }
  }

  return pools;
}

async function runEvaluationEpisodes({
  evaluationId,
  seed,
  rounds,
  poolSize,
  poolCount,
  shuffle,
  episodesPerPool,
  normalizedAgents,
  topEnvFactory,
  envName,
  envOpts,
  abortSignal,
}) {
  const customPoolBuilder =
    topEnvFactory && typeof topEnvFactory.buildPools === "function"
      ? topEnvFactory.buildPools
      : null;

  let pools;
  let effectiveEpisodesPerPool = episodesPerPool;

  if (customPoolBuilder) {
    const customBuildResult = customPoolBuilder({
      evaluationId,
      seed,
      rounds,
      agents: normalizedAgents,
      poolSize,
      poolCount,
      shuffle,
      episodesPerPool,
      envName,
      envOpts,
    });

    if (Array.isArray(customBuildResult)) {
      pools = customBuildResult;
    } else if (customBuildResult && Array.isArray(customBuildResult.pools)) {
      pools = customBuildResult.pools;
      if (
        Number.isInteger(Number(customBuildResult.episodesPerPool)) &&
        Number(customBuildResult.episodesPerPool) > 0
      ) {
        effectiveEpisodesPerPool = Number(customBuildResult.episodesPerPool);
      }
    } else {
      throw new Error(
        "env buildPools must return pools[] or { pools, episodesPerPool? }",
      );
    }
  } else {
    pools = PoolBuilder.buildPools({
      evaluationId,
      seed,
      agents: normalizedAgents,
      poolSize,
      poolCount,
      shuffle,
    });
  }

  pools = validatePoolsOrThrow(pools, evaluationId);

  const episodes = [];

  for (let pIndex = 0; pIndex < pools.length; pIndex++) {
    throwIfAborted(abortSignal);

    const pool = pools[pIndex];
    for (let e = 0; e < effectiveEpisodesPerPool; e++) {
      throwIfAborted(abortSignal);

      const episodeSeed = PoolBuilder.deriveSeed(
        evaluationId,
        seed,
        `pool:${pIndex}:episode:${e}`,
      );

      let episodeResult = {
        evaluationId,
        poolId: pool.poolId,
        episodeIndex: e,
        seed: episodeSeed,
        agentResults: [],
      };

      try {
        const envFactory = resolveEnvFactoryForPool(pool, topEnvFactory);
        if (!envFactory) {
          throw new Error(
            "No envFactory provided: set `config.envFactory`, `config.envName`, or supply `pool.envFactory`/`pool.envName`",
          );
        }

        const episodeEnvOpts = resolveEpisodeEnvOpts(envOpts, pool, rounds);

        const runnerRes = await runEpisode({
          seed: episodeSeed,
          envFactory,
          envOpts: episodeEnvOpts,
          config: { rounds, poolId: pool.poolId },
          agents: pool.agents,
          abortSignal,
        });

        const agentResults = getRunnerAgentResults(runnerRes);
        for (const ar of agentResults) {
          episodeResult.agentResults.push(toEpisodeAgentResult(ar));
        }
      } catch (err) {
        if (err && (err.name === "AbortError" || err.message === "aborted")) {
          SiLog.Message(`Evaluation aborted: ${evaluationId}`);
          throw err;
        }

        SiLog.Message(
          `Episode failed: pool=${pool.poolId} episode=${e} error=${err}`,
        );

        for (const agent of pool.agents) {
          episodeResult.agentResults.push(buildFailedEpisodeAgentResult(agent));
        }
      }

      episodes.push(episodeResult);
    }
  }

  return {
    pools,
    episodes,
    actualPoolCount: pools.length,
  };
}

module.exports = {
  runEvaluationEpisodes,
};
