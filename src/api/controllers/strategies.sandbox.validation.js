const { randomUUID } = require("crypto");
const StrategyLoader = require("../../domain/strategy/StrategyLoader");

const SANDBOX_MAX_EPISODES = 1;
const SANDBOX_MAX_STEPS_CAP = 1000;
const SANDBOX_DEFAULT_MAX_STEPS_BY_ENV = {
  AuctionHouse: 200,
};
const TRACE_MODES = new Set(["none", "summary", "full"]);

function buildRunId() {
  return `sandbox_${Date.now()}_${randomUUID().replace(/-/g, "")}`;
}

function createApiError(status, error, message, details = {}) {
  const err = new Error(message || error);
  err.status = status;
  err.api = { ok: false, error, message, details };
  return err;
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function getDefaultMaxSteps(envName) {
  return SANDBOX_DEFAULT_MAX_STEPS_BY_ENV[envName] || 200;
}

function validateSandboxBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw createApiError(
      400,
      "INVALID_REQUEST",
      "request body must be an object",
    );
  }

  if (typeof body.envName !== "string" || !body.envName.trim()) {
    throw createApiError(400, "INVALID_REQUEST", "envName is required", {
      field: "envName",
    });
  }

  if (typeof body.source !== "string" || !body.source.trim()) {
    throw createApiError(400, "INVALID_REQUEST", "source is required", {
      field: "source",
    });
  }

  if (
    body.metadata !== undefined &&
    (typeof body.metadata !== "object" || body.metadata === null)
  ) {
    throw createApiError(400, "INVALID_REQUEST", "metadata must be an object", {
      field: "metadata",
    });
  }

  if (
    body.runOptions !== undefined &&
    (typeof body.runOptions !== "object" ||
      body.runOptions === null ||
      Array.isArray(body.runOptions))
  ) {
    throw createApiError(
      400,
      "INVALID_REQUEST",
      "runOptions must be an object",
      { field: "runOptions" },
    );
  }
}

function resolveSandboxConfig(body, runId) {
  const envName = body.envName.trim();
  const source = body.source;
  const metadata =
    body.metadata && typeof body.metadata === "object" ? body.metadata : {};
  const runOptions = body.runOptions || {};

  const episodes = Math.min(
    SANDBOX_MAX_EPISODES,
    normalizePositiveInt(runOptions.episodes, SANDBOX_MAX_EPISODES),
  );

  const maxSteps = Math.min(
    SANDBOX_MAX_STEPS_CAP,
    normalizePositiveInt(runOptions.maxSteps, getDefaultMaxSteps(envName)),
  );

  const traceModeRaw =
    typeof runOptions.traceMode === "string"
      ? runOptions.traceMode.trim().toLowerCase()
      : "summary";
  const traceMode = TRACE_MODES.has(traceModeRaw) ? traceModeRaw : "summary";

  const seed =
    runOptions.seed !== undefined && runOptions.seed !== null
      ? runOptions.seed
      : `${Date.now()}-${runId}`;

  return {
    envName,
    source,
    metadata,
    episodes,
    maxSteps,
    traceMode,
    seed,
  };
}

function verifyStrategySource(name, source) {
  const warnings = [];
  const errors = [];

  const forbiddenApiPatterns = [
    { regex: /\brequire\s*\(/, code: "FORBIDDEN_API", label: "require" },
    { regex: /\bprocess\b/, code: "FORBIDDEN_API", label: "process" },
    {
      regex: /\bglobalThis\b/,
      code: "FORBIDDEN_API",
      label: "globalThis",
    },
  ];

  for (const check of forbiddenApiPatterns) {
    if (check.regex.test(source)) {
      errors.push({
        code: check.code,
        message: `Forbidden API usage detected: ${check.label}`,
      });
    }
  }

  if (errors.length) {
    return { ok: false, errors, warnings, module: null };
  }

  const loaded = StrategyLoader.loadStrategy({ name, code: source });
  if (loaded.error) {
    const message = String(loaded.error.message || loaded.error);
    const code = /missing\s+\w+\(\)/i.test(message)
      ? "MISSING_CONTRACT_METHOD"
      : "INVALID_STRATEGY";

    return {
      ok: false,
      errors: [{ code, message }],
      warnings,
      module: null,
    };
  }

  return {
    ok: true,
    errors,
    warnings,
    module: loaded.module,
  };
}

module.exports = {
  buildRunId,
  validateSandboxBody,
  resolveSandboxConfig,
  verifyStrategySource,
};
