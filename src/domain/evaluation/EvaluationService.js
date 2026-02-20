const { validateShape } = require("../../utils/utils");
const { EvaluationContract } = require("./EvaluationConfig");
const MetricsCalculator = require("../metrics/MetricsCalculator");
const RankingsService = require("../metrics/RankingsService");
const {
  clearEvaluationResults,
  persistEvaluationAggregateResults,
} = require("../../persistence/episodePersistence");
const SiLog = require("../../utils/SiLog");
const {
  throwIfAborted,
  normalizeConfig,
} = require("./EvaluationService.helpers");
const {
  persistEvaluationRecord,
  buildCompletedPayload,
  buildFailedPayload,
} = require("./EvaluationService.persistence");
const { runEvaluationEpisodes } = require("./EvaluationService.runner");

const EvaluationService = {
  async runEvaluation(config) {
    validateShape(config, EvaluationContract);

    const abortSignal = config.abortSignal;
    throwIfAborted(abortSignal);

    const {
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
      poolCountInput,
    } = normalizeConfig(config);

    if (!topEnvFactory) {
      throw new Error(`envFactory/envName not present in config`);
    }

    let pools = [];
    let episodes = [];
    let actualPoolCount = Number.isInteger(Number(poolCountInput))
      ? Number(poolCountInput)
      : 0;
    const startedAt = new Date();

    try {
      await clearEvaluationResults(evaluationId);

      const runResult = await runEvaluationEpisodes({
        evaluationId,
        seed,
        rounds,
        poolSize,
        poolCount: poolCountInput,
        shuffle,
        episodesPerPool,
        normalizedAgents,
        topEnvFactory,
        envOpts,
        abortSignal,
      });
      pools = runResult.pools;
      episodes = runResult.episodes;
      actualPoolCount = runResult.actualPoolCount;

      const metrics = MetricsCalculator.fromEpisodes(episodes);
      const ranking = RankingsService.rank(metrics, rankingOptions);

      await persistEvaluationAggregateResults({
        evaluationId,
        userId,
        envName,
        seed,
        ranking,
        metrics,
        agents: normalizedAgents,
      });

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

      await persistEvaluationRecord(
        buildCompletedPayload({
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
          startedAt,
          metrics,
          ranking,
        }),
      );

      return evaluationResult;
    } catch (err) {
      const failurePayload = buildFailedPayload({
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
        startedAt,
        error: err,
      });
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
