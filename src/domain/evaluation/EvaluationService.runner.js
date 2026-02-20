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
  envOpts,
  abortSignal,
}) {
  let pools = PoolBuilder.buildPools({
    evaluationId,
    seed,
    agents: normalizedAgents,
    poolSize,
    poolCount,
    shuffle,
  });

  const episodes = [];

  for (let pIndex = 0; pIndex < pools.length; pIndex++) {
    throwIfAborted(abortSignal);

    const pool = pools[pIndex];
    for (let e = 0; e < episodesPerPool; e++) {
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
