const { validateShape } = require("../../utils/utils");
const { EvaluationContract } = require("./EvaluationConfig");
const PoolBuilder = require("./PoolBuilder");
const { runEpisode } = require("../../engine/runner/EpisodeRunner");
const Envs = require("../../engine/environments");
const MetricsCalculator = require("../metrics/MetricsCalculator");
const RankingsService = require("../metrics/RankingsService");
const EvaluationModel = require("../../persistence/models/Evaluation.model");
const {
  clearEvaluationResults,
} = require("../../persistence/episodePersistence");
const DB = require("../../utils/DB");
const SiLog = require("../../utils/SiLog");

function throwIfAborted(signal) {
  if (signal && signal.aborted) {
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  }
}

async function persistEvaluationRecord(payload) {
  if (!payload || !payload.evaluationId) {
    return null;
  }
  await DB.connect();
  return EvaluationModel.findOneAndUpdate(
    { evaluationId: payload.evaluationId },
    { $set: payload },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
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
    const rankingOptions = config.rankingOptions || config.ranking || {};
    const envName = config.envName || "";
    const envOpts =
      config.envOpts && typeof config.envOpts === "object"
        ? config.envOpts
        : {};
    const userId = config.userId || null;

    const normalizedAgents = (config.agents || []).map((agent) => ({
      ...agent,
      ownerId: agent.ownerId || agent.userId || null,
    }));

    const topEnvFactory =
      config.envFactory ||
      (config.envName ? Envs.getFactory(config.envName) : null);

    if (!topEnvFactory) {
      throw new Error(`envFactory/envName not present in config`);
    }

    let pools = [];
    const episodes = [];
    let actualPoolCount = Number.isInteger(Number(config.poolCount))
      ? Number(config.poolCount)
      : 0;
    const startedAt = new Date();

    const resolveEnvFactoryForPool = (pool) => {
      if (pool.envFactory) return pool.envFactory;
      if (pool.envName) return Envs.getFactory(pool.envName);
      return topEnvFactory;
    };

    try {
      await clearEvaluationResults(evaluationId);
      pools = PoolBuilder.buildPools({
        evaluationId,
        seed,
        agents: normalizedAgents,
        poolSize,
        poolCount: config.poolCount,
        shuffle,
      });

      actualPoolCount = pools.length;

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
              persistence: {
                evaluationId,
                poolId: pool.poolId,
                episodeIndex: e,
                seed: episodeSeed,
                userId,
              },
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
              const spent = Number.isFinite(Number(ar.spent))
                ? Number(ar.spent)
                : null;
              const remainingBudget = Number.isFinite(
                Number(ar.remainingBudget),
              )
                ? Number(ar.remainingBudget)
                : null;
              const wins = Number.isFinite(Number(ar.wins))
                ? Number(ar.wins)
                : null;
              const finalWealth = Number.isFinite(Number(ar.finalWealth))
                ? Number(ar.finalWealth)
                : null;
              const inventoryValue = Number.isFinite(Number(ar.inventoryValue))
                ? Number(ar.inventoryValue)
                : null;
              episodeResult.agentResults.push({
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
              });
            }
          } catch (err) {
            // propagate abort immediately
            if (
              err &&
              (err.name === "AbortError" || err.message === "aborted")
            ) {
              SiLog.Message(`Evaluation aborted: ${evaluationId}`);
              throw err;
            }

            SiLog.Message(
              `Episode failed: pool=${pool.poolId} episode=${e} error=${err}`,
            );
            for (const agent of pool.agents) {
              const id = agent.id || agent.agentId || agent.name;
              episodeResult.agentResults.push({
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
              });
            }
          }

          episodes.push(episodeResult);
        }
      }

      const metrics = MetricsCalculator.fromEpisodes(episodes);
      const ranking = RankingsService.rank(metrics, rankingOptions);
      const evaluationResult = {
        userId,
        evaluationId,
        seed,
        config: { rounds, poolSize, episodesPerPool, shuffle },
        pools,
        episodes,
        metrics,
        ranking,
        generatedAt: new Date().toISOString(),
      };

      await persistEvaluationRecord({
        evaluationId,
        seed,
        rounds,
        poolSize,
        poolCount: actualPoolCount,
        episodesPerPool,
        envName,
        envOpts,
        agents: normalizedAgents,
        userId,
        status: "completed",
        startedAt,
        completedAt: new Date(),
        metrics,
        ranking,
        error: "",
      });

      return evaluationResult;
    } catch (err) {
      const failurePayload = {
        evaluationId,
        seed,
        rounds,
        poolSize,
        poolCount: actualPoolCount,
        episodesPerPool,
        envName,
        envOpts,
        agents: config.agents,
        userId,
        status: "failed",
        startedAt,
        completedAt: new Date(),
        metrics: {},
        ranking: [],
        error: err && err.message ? err.message : String(err || "unknown"),
      };
      try {
        await persistEvaluationRecord(failurePayload);
      } catch (persistErr) {
        SiLog.Message(
          `Failed to persist failed evaluation ${evaluationId}: ${persistErr}`,
        );
      }
      throw err;
    }
  },
};

module.exports = EvaluationService;
