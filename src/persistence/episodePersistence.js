const DB = require("../utils/DB");
const ResultModel = require("./models/Result.model");

function safeNumber(value, fallback = 0) {
  if (value === null || value === undefined) return fallback;
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function buildAggregateResultDocs({
  evaluationId,
  userId = null,
  envName = "",
  seed = "",
  ranking = [],
  metrics = {},
  agents = [],
}) {
  const ownerByAgentId = new Map();
  for (const agent of agents || []) {
    const id = agent && (agent.id || agent.agentId || agent.name);
    if (!id) continue;
    ownerByAgentId.set(id, agent.ownerId || agent.userId || null);
  }

  const docs = [];
  for (const row of ranking || []) {
    if (!row) continue;
    const agentId = row.agentId || row.id;
    if (!agentId) continue;
    const metric = metrics[agentId] || {};
    const doc = {
      evaluationId,
      envName,
      seed,
      agentId,
      userId: userId || null,
      agentOwnerId: ownerByAgentId.get(agentId) || null,
      rank: safeNumber(row.rank),
      totalReturn: safeNumber(row.totalReturn, safeNumber(metric.totalReturn)),
      episodesCounted: safeNumber(
        row.episodesCounted,
        safeNumber(metric.episodesCounted),
      ),
      averageReturn: safeNumber(
        row.averageReturn,
        safeNumber(metric.averageReturn),
      ),
      variance: safeNumber(row.variance, safeNumber(metric.variance)),
      downside: safeNumber(row.downside, safeNumber(metric.downside)),
      failures: safeNumber(row.failures, safeNumber(metric.failures)),
      failRate: safeNumber(row.failRate, safeNumber(metric.failRate)),
      totalFinalWealth: safeNumber(
        row.totalFinalWealth,
        safeNumber(metric.totalFinalWealth),
      ),
      averageFinalWealth: safeNumber(
        row.averageFinalWealth,
        safeNumber(metric.averageFinalWealth),
      ),
      totalSpent: safeNumber(row.totalSpent, safeNumber(metric.totalSpent)),
      averageSpent: safeNumber(
        row.averageSpent,
        safeNumber(metric.averageSpent),
      ),
      averageRemainingBudget: safeNumber(
        row.averageRemainingBudget,
        safeNumber(metric.averageRemainingBudget),
      ),
      averageROI: safeNumber(row.averageROI, safeNumber(metric.averageROI)),
      roiVariance: safeNumber(row.roiVariance, safeNumber(metric.roiVariance)),
      bankruptcies: safeNumber(
        row.bankruptcies,
        safeNumber(metric.bankruptcies),
      ),
      metrics: {
        ...metric,
        ...row,
      },
    };
    docs.push(doc);
  }
  return docs;
}

async function clearEvaluationResults(evaluationId) {
  if (!evaluationId) return null;
  await DB.connect();
  return ResultModel.deleteMany({ evaluationId });
}

async function persistEvaluationAggregateResults({
  evaluationId,
  userId = null,
  envName = "",
  seed = "",
  ranking = [],
  metrics = {},
  agents = [],
}) {
  if (!evaluationId) return [];
  const docs = buildAggregateResultDocs({
    evaluationId,
    userId,
    envName,
    seed,
    ranking,
    metrics,
    agents,
  });
  if (!docs.length) return [];
  await DB.connect();
  return ResultModel.insertMany(docs, { ordered: true });
}

module.exports = {
  clearEvaluationResults,
  persistEvaluationAggregateResults,
};
