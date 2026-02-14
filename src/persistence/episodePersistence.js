const DB = require("../utils/DB");
const ResultModel = require("./models/Result.model");

function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined) return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function buildDocsForAgentResults({
  evaluationId,
  poolId = "",
  episodeIndex = 0,
  seed = "",
  agentResults = [],
}) {
  const docs = [];
  for (const agentResult of agentResults || []) {
    if (!agentResult) continue;
    const agentId = agentResult.id || agentResult.agentId || agentResult.name;
    if (!agentId) continue;
    const returnValue = Number.isFinite(Number(agentResult.return))
      ? Number(agentResult.return)
      : Number.isFinite(Number(agentResult.value))
        ? Number(agentResult.value)
        : Number.isFinite(Number(agentResult.payoff))
          ? Number(agentResult.payoff)
          : 0;
    const doc = {
      evaluationId,
      agentId,
      episodeIndex,
      poolId,
      seed,
      return: returnValue,
      finalWealth: safeNumber(agentResult.finalWealth),
      remainingBudget: safeNumber(agentResult.remainingBudget),
      spent: safeNumber(agentResult.spent),
      wins: safeNumber(agentResult.wins),
      metrics: {
        failed: !!agentResult.failed,
      },
    };
    if (Number.isFinite(Number(agentResult.inventoryValue))) {
      doc.metrics.inventoryValue = Number(agentResult.inventoryValue);
    }
    if (agentResult && "value" in agentResult) {
      const metricValue = Number(agentResult.value);
      if (Number.isFinite(metricValue)) {
        doc.metrics.value = metricValue;
      }
    }
    docs.push(doc);
  }
  return docs;
}

async function clearEvaluationResults(evaluationId) {
  if (!evaluationId) return null;
  await DB.connect();
  return ResultModel.deleteMany({ evaluationId });
}

async function persistEpisodeResult({
  evaluationId,
  poolId,
  episodeIndex,
  seed,
  agentResults,
}) {
  if (!evaluationId) return [];
  const docs = buildDocsForAgentResults({
    evaluationId,
    poolId,
    episodeIndex,
    seed,
    agentResults,
  });
  if (!docs.length) return [];
  await DB.connect();
  return ResultModel.insertMany(docs, { ordered: false });
}

async function persistEpisodeResults(evaluationId, episodes = []) {
  if (!evaluationId) return [];
  await clearEvaluationResults(evaluationId);
  const docs = [];
  for (const episode of episodes || []) {
    const episodeSeed = (episode && episode.seed) || "";
    const episodeIndex =
      episode && Number.isFinite(Number(episode.episodeIndex))
        ? Number(episode.episodeIndex)
        : 0;
    const poolId = (episode && episode.poolId) || "";
    const agentResults = (episode && episode.agentResults) || [];
    docs.push(
      ...buildDocsForAgentResults({
        evaluationId,
        poolId,
        episodeIndex,
        seed: episodeSeed,
        agentResults,
      }),
    );
  }
  if (!docs.length) return [];
  await DB.connect();
  return ResultModel.insertMany(docs, { ordered: false });
}

module.exports = {
  clearEvaluationResults,
  persistEpisodeResult,
  persistEpisodeResults,
};
