const EvaluationModel = require("../../persistence/models/Evaluation.model");
const ResultModel = require("../../persistence/models/Result.model");
const DB = require("../../utils/DB");

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

function normalizeLimit(value) {
  if (Number.isFinite(Number(value))) {
    return Math.min(Math.max(Number(value), 1), MAX_LIMIT);
  }
  return DEFAULT_LIMIT;
}

function normalizeSkip(value) {
  if (Number.isFinite(Number(value))) {
    return Math.max(Number(value), 0);
  }
  return 0;
}

function normalizeString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function resolveEvaluation({ envName, evaluationId }) {
  if (evaluationId) {
    return EvaluationModel.findOne({
      evaluationId,
      status: "completed",
      ...(envName ? { envName } : {}),
    })
      .select("evaluationId envName status completedAt createdAt")
      .lean();
  }

  if (!envName) {
    return null;
  }

  return EvaluationModel.findOne({
    envName,
    status: "completed",
  })
    .sort({ completedAt: -1, createdAt: -1 })
    .select("evaluationId envName status completedAt createdAt")
    .lean();
}

async function listLeaderboardEvaluations(req, res) {
  try {
    await DB.connect();

    const envName = normalizeString(req.query.envName);
    const evaluationId = normalizeString(req.query.evaluationId);

    if (!envName && !evaluationId) {
      return res.status(400).json({
        error: "envName or evaluationId query parameter is required",
      });
    }

    const evaluation = await resolveEvaluation({ envName, evaluationId });
    if (!evaluation) {
      return res.status(404).json({
        error: "completed evaluation not found",
        envName,
        evaluationId,
      });
    }

    const limit = normalizeLimit(req.query.limit);
    const skip = normalizeSkip(req.query.skip);

    const filter = {
      evaluationId: evaluation.evaluationId,
    };

    const [results, total] = await Promise.all([
      ResultModel.find(filter)
        .sort({ rank: 1, agentId: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ResultModel.countDocuments(filter),
    ]);

    return res.json({
      meta: {
        envName: evaluation.envName,
        evaluationId: evaluation.evaluationId,
        status: evaluation.status,
        completedAt: evaluation.completedAt || null,
        limit,
        skip,
        total,
      },
      results,
    });
  } catch (err) {
    console.error("failed to list leaderboard evaluations", err);
    return res.status(500).json({
      error: "unable to fetch leaderboard",
      details: err?.message,
    });
  }
}

module.exports = {
  listLeaderboardEvaluations,
};
