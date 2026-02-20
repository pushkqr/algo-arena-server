const EvaluationModel = require("../../persistence/models/Evaluation.model");
const DB = require("../../utils/DB");

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

function buildCompletedPayload({
  evaluationId,
  seed,
  rounds,
  poolSize,
  poolCount,
  episodesPerPool,
  envName,
  envOpts,
  agents,
  userId,
  startedAt,
  metrics,
  ranking,
}) {
  return {
    evaluationId,
    seed,
    rounds,
    poolSize,
    poolCount,
    episodesPerPool,
    envName,
    envOpts,
    agents,
    userId,
    status: "completed",
    startedAt,
    completedAt: new Date(),
    metrics,
    ranking,
    error: "",
  };
}

function buildFailedPayload({
  evaluationId,
  seed,
  rounds,
  poolSize,
  poolCount,
  episodesPerPool,
  envName,
  envOpts,
  agents,
  userId,
  startedAt,
  error,
}) {
  return {
    evaluationId,
    seed,
    rounds,
    poolSize,
    poolCount,
    episodesPerPool,
    envName,
    envOpts,
    agents,
    userId,
    status: "failed",
    startedAt,
    completedAt: new Date(),
    metrics: {},
    ranking: [],
    error: error && error.message ? error.message : String(error || "unknown"),
  };
}

module.exports = {
  persistEvaluationRecord,
  buildCompletedPayload,
  buildFailedPayload,
};
