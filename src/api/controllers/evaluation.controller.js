const { randomUUID } = require("crypto");
const evaluationEngine = require("../evaluationEngine");
const EvaluationModel = require("../../persistence/models/Evaluation.model");
const Environments = require("../../engine/environments");
const DB = require("../../utils/DB");
const {
  normalizeEnvName,
  resolveEnvOpts,
  buildQueuedRecord,
  resolvePagination,
} = require("./evaluation.helpers");
const { resolveAgentsFromStrategies } = require("./evaluation.agentResolver");
const { saveQueuedRecord } = require("./evaluation.persistence");

async function startEvaluation(req, res) {
  try {
    const body = req.body || {};
    const envName = normalizeEnvName(req.query.envName || body.envName);
    const envOpts = resolveEnvOpts(body);
    const envValidation = Environments.validateEnvOptions(envName, envOpts);
    if (!envValidation.valid) {
      return res.status(400).json({
        error: "invalid envOpts",
        envName,
        details: envValidation.errors,
      });
    }
    const requestPayload = {
      ...body,
      envName,
      envOpts,
    };
    const evaluationId = String(body.evaluationId || randomUUID());
    const resolvedSeed =
      body.seed !== undefined ? String(body.seed) : String(Date.now());
    let agents =
      Array.isArray(body.agents) && body.agents.length ? body.agents : null;
    if (!agents) {
      agents = await resolveAgentsFromStrategies(requestPayload);
    }
    if (!agents || !agents.length) {
      return res.status(400).json({ error: "no active strategies available" });
    }
    const config = {
      ...requestPayload,
      evaluationId,
      userId: req.userId,
      agents,
      seed: resolvedSeed,
      shuffle: body.shuffle !== undefined ? !!body.shuffle : true,
    };
    const queuedRecord = buildQueuedRecord(
      requestPayload,
      evaluationId,
      req.userId,
      agents,
      resolvedSeed,
    );

    await saveQueuedRecord(queuedRecord);

    // const { promise } = evaluationEngine.startEvaluation(config);
    // const result = await promise;
    // console.log("metrics", JSON.stringify(result.metrics, null, 2));

    const queued = evaluationEngine.startEvaluation(config);
    if (queued && queued.promise) {
      queued.promise.catch((err) => {
        console.error("evaluation engine failure", evaluationId, err);
      });
    }

    return res
      .status(202)
      .set("Location", `/api/evaluations/${evaluationId}`)
      .json({ evaluationId, status: "queued" });
  } catch (err) {
    console.error("failed to start evaluation", err);
    return res
      .status(500)
      .json({ error: "unable to queue evaluation", details: err?.message });
  }
}

async function getEnvironmentOptions(req, res) {
  try {
    const body = req.body || {};
    const rawEnvName = req.query.envName || body.envName;

    if (typeof rawEnvName === "string" && rawEnvName.trim()) {
      const envName = rawEnvName.trim();
      const spec = Environments.getEnvOptionSpec(envName);
      if (!spec) {
        return res.status(404).json({
          error: "environment option schema not found",
          envName,
          availableEnvironments: Environments.listEnvs(),
        });
      }
      return res.json(spec);
    }

    return res.json({
      environments: Environments.listEnvOptionSpecs(),
    });
  } catch (err) {
    console.error("failed to load environment options", err);
    return res.status(500).json({
      error: "unable to load environment options",
      details: err?.message,
    });
  }
}

async function listEvaluations(req, res) {
  try {
    const status =
      typeof req.query.status === "string" ? req.query.status : null;
    const { limit, skip } = resolvePagination(req.query);

    await DB.connect();
    const filter = { userId: req.userId };
    if (status) {
      filter.status = status;
    }

    const [evaluations, total] = await Promise.all([
      EvaluationModel.find(filter)
        .sort({ startedAt: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      EvaluationModel.countDocuments(filter),
    ]);

    return res.json({
      meta: { limit, skip, status: filter.status || null, total },
      evaluations,
    });
  } catch (err) {
    console.error("failed to list evaluations", err);
    return res
      .status(500)
      .json({ error: "unable to list evaluations", details: err?.message });
  }
}

async function getEvaluation(req, res) {
  try {
    const evaluationId = req.params.evaluationId;
    if (!evaluationId) {
      return res.status(400).json({ error: "evaluationId required" });
    }

    await DB.connect();
    const evaluation = await EvaluationModel.findOne({
      evaluationId,
      userId: req.userId,
    }).lean();

    if (!evaluation) {
      return res.status(404).json({ error: "evaluation not found" });
    }

    return res.json(evaluation);
  } catch (err) {
    console.error("failed to fetch evaluation", err);
    return res
      .status(500)
      .json({ error: "unable to load evaluation", details: err?.message });
  }
}

module.exports = {
  getEnvironmentOptions,
  startEvaluation,
  listEvaluations,
  getEvaluation,
};
