const { validateShape } = require("../../utils/utils");
const { EvaluationContract } = require("./EvaluationConfig");
const PoolBuilder = require("./PoolBuilder");
const { runEpisode } = require("../../engine/runner/EpisodeRunner");
const Envs = require("../../engine/environments");
const SiLog = require("../../utils/SiLog");

function throwIfAborted(signal) {
  if (signal && signal.aborted) {
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  }
}

const EvaluationService = {
  async runEvaluation(config) {
    validateShape(config, EvaluationContract);

    const abortSignal = config.abortSignal; // optional AbortSignal
    throwIfAborted(abortSignal);

    const evaluationId = String(config.evaluationId);
    const seed = String(config.seed || "0");
    const rounds = Number(config.rounds) || 10;
    const poolSize = Number(config.poolSize);
    const episodesPerPool = Number(config.episodesPerPool) || 1;
    const shuffle = config.shuffle !== false;

    const topEnvFactory =
      config.envFactory ||
      (config.envName ? Envs.getFactory(config.envName) : null);

    const pools = PoolBuilder.buildPools({
      evaluationId,
      seed,
      agents: config.agents,
      poolSize,
      poolCount: config.poolCount,
      shuffle,
    });

    const episodes = [];
    const aggregates = {};

    const safeRecord = (agentId, val, failed = false) => {
      if (!aggregates[agentId])
        aggregates[agentId] = { totalReturn: 0, count: 0, fails: 0 };
      if (failed) aggregates[agentId].fails += 1;
      else {
        aggregates[agentId].totalReturn += Number(val || 0);
        aggregates[agentId].count += 1;
      }
    };

    const resolveEnvFactoryForPool = (pool) => {
      if (pool.envFactory) return pool.envFactory;
      if (pool.envName) return Envs.getFactory(pool.envName);
      return topEnvFactory;
    };

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
          const envFactory = resolveEnvFactoryForPool(pool);
          if (!envFactory) {
            throw new Error(
              "No envFactory provided: set `config.envFactory`, `config.envName`, or supply `pool.envFactory`/`pool.envName`",
            );
          }

          const runnerRes = await runEpisode({
            seed: episodeSeed,
            envFactory,
            config: { rounds, poolId: pool.poolId },
            agents: pool.agents,
            abortSignal, // pass cancellation down
          });

          const agentResults =
            runnerRes && runnerRes.agentResults
              ? runnerRes.agentResults
              : Array.isArray(runnerRes)
                ? runnerRes
                : runnerRes && (runnerRes.results || runnerRes.outcomes)
                  ? runnerRes.results || runnerRes.outcomes
                  : [];

          for (const ar of agentResults) {
            const id = ar.id || ar.agentId || ar.name;
            const value =
              "return" in ar
                ? ar.return
                : "payoff" in ar
                  ? ar.payoff
                  : ar.value;
            const failed = !!ar.failed;
            episodeResult.agentResults.push({ id, value, failed });
            safeRecord(id, value, failed);
          }
        } catch (err) {
          // propagate abort immediately
          if (err && (err.name === "AbortError" || err.message === "aborted")) {
            SiLog.Message(`Evaluation aborted: ${evaluationId}`);
            throw err;
          }

          SiLog.Message(
            `Episode failed: pool=${pool.poolId} episode=${e} error=${err}`,
          );
          for (const agent of pool.agents) {
            const id = agent.id || agent.agentId || agent.name;
            episodeResult.agentResults.push({ id, value: null, failed: true });
            safeRecord(id, null, true);
          }
        }

        episodes.push(episodeResult);
      }
    }

    const metrics = {};
    for (const [agentId, agg] of Object.entries(aggregates)) {
      const avg = agg.count > 0 ? agg.totalReturn / agg.count : 0;
      metrics[agentId] = {
        totalReturn: agg.totalReturn,
        episodesCounted: agg.count,
        failures: agg.fails,
        averageReturn: avg,
      };
    }

    const evaluationResult = {
      evaluationId,
      seed,
      config: { rounds, poolSize, episodesPerPool, shuffle },
      pools,
      episodes,
      metrics,
      generatedAt: new Date().toISOString(),
    };

    return evaluationResult;
  },
};

module.exports = EvaluationService;
