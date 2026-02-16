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

async function listEvaluationResults(req, res) {
  try {
    const { evaluationId } = req.params;
    if (!evaluationId) {
      return res.status(400).json({ error: "evaluationId required" });
    }

    await DB.connect();
    const evaluation = await EvaluationModel.findOne({ evaluationId })
      .lean()
      .select("evaluationId");
    if (!evaluation) {
      return res.status(404).json({ error: "evaluation not found" });
    }

    const limit = normalizeLimit(req.query.limit);
    const skip = normalizeSkip(req.query.skip);
    const filter = {
      evaluationId,
      agentOwnerId: req.userId,
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
      meta: { evaluationId, limit, skip, total },
      results,
    });
  } catch (err) {
    console.error("failed to list results", err);
    return res
      .status(500)
      .json({ error: "unable to fetch results", details: err?.message });
  }
}

async function getResult(req, res) {
  try {
    const { resultId } = req.params;
    if (!resultId) {
      return res.status(400).json({ error: "resultId required" });
    }
    await DB.connect();
    const result = await ResultModel.findOne({
      _id: resultId,
      agentOwnerId: req.userId,
    }).lean();
    if (!result) {
      return res.status(404).json({ error: "result not found" });
    }
    return res.json(result);
  } catch (err) {
    console.error("failed to fetch result", err);
    return res
      .status(500)
      .json({ error: "unable to load result", details: err?.message });
  }
}

module.exports = {
  listEvaluationResults,
  getResult,
};
