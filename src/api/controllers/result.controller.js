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

async function listUserResults(req, res) {
  try {
    await DB.connect();

    const limit = normalizeLimit(req.query.limit);
    const skip = normalizeSkip(req.query.skip);

    const filter = {
      agentOwnerId: req.userId,
    };

    if (typeof req.query.envName === "string" && req.query.envName.trim()) {
      filter.envName = req.query.envName.trim();
    }
    if (
      typeof req.query.evaluationId === "string" &&
      req.query.evaluationId.trim()
    ) {
      filter.evaluationId = req.query.evaluationId.trim();
    }
    if (typeof req.query.agentId === "string" && req.query.agentId.trim()) {
      filter.agentId = req.query.agentId.trim();
    }

    const [results, total] = await Promise.all([
      ResultModel.find(filter)
        .sort({ createdAt: -1, evaluationId: -1, rank: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ResultModel.countDocuments(filter),
    ]);

    return res.json({
      meta: {
        limit,
        skip,
        total,
        envName: filter.envName || null,
        evaluationId: filter.evaluationId || null,
        agentId: filter.agentId || null,
      },
      results,
    });
  } catch (err) {
    console.error("failed to list user results", err);
    return res
      .status(500)
      .json({ error: "unable to fetch results", details: err?.message });
  }
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

async function getResultItem(req, res) {
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
    console.error("failed to fetch result item", err);
    return res
      .status(500)
      .json({ error: "unable to load result", details: err?.message });
  }
}

module.exports = {
  listUserResults,
  listEvaluationResults,
  getResultItem,
};
