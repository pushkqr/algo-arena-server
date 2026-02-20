const DEFAULT_LIST_LIMIT = 30;
const MAX_LIST_LIMIT = 200;

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeEnvOpts(opts) {
  if (opts && typeof opts === "object" && !Array.isArray(opts)) {
    return opts;
  }
  return {};
}

function resolveEnvOpts(body = {}) {
  if (
    body.envOpts &&
    typeof body.envOpts === "object" &&
    !Array.isArray(body.envOpts)
  ) {
    return normalizeEnvOpts(body.envOpts);
  }
  if (
    body.envConfig &&
    typeof body.envConfig === "object" &&
    !Array.isArray(body.envConfig)
  ) {
    return normalizeEnvOpts(body.envConfig);
  }
  return {};
}

function normalizeEnvName(value) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return "AuctionHouse";
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === "string" ? item.trim() : `${item}`))
    .filter((item) => item);
}

function stringifyId(value) {
  if (typeof value === "string") return value;
  if (value && typeof value.toString === "function") return value.toString();
  return "";
}

function buildQueuedRecord(body, evaluationId, userId, agents = [], seedValue) {
  const envName = normalizeEnvName(body.envName);
  const envOpts = resolveEnvOpts(body);
  return {
    evaluationId,
    userId,
    status: "queued",
    seed:
      seedValue !== undefined
        ? String(seedValue)
        : body.seed !== undefined
          ? String(body.seed)
          : "",
    rounds: toNumber(body.rounds, 0),
    poolSize: toNumber(body.poolSize, 0),
    poolCount: toNumber(body.poolCount, 0),
    episodesPerPool: toNumber(body.episodesPerPool, 0),
    envName,
    envOpts,
    agents,
    metrics: {},
    ranking: [],
    error: "",
    startedAt: null,
    completedAt: null,
  };
}

function resolvePagination(query = {}) {
  const requestedLimit = parseInt(query.limit, 10);
  const requestedSkip = parseInt(query.skip, 10);

  const limit = Math.min(
    MAX_LIST_LIMIT,
    Math.max(
      1,
      Number.isFinite(requestedLimit) ? requestedLimit : DEFAULT_LIST_LIMIT,
    ),
  );

  const skip = Math.max(0, Number.isFinite(requestedSkip) ? requestedSkip : 0);

  return { limit, skip };
}

module.exports = {
  DEFAULT_LIST_LIMIT,
  MAX_LIST_LIMIT,
  toNumber,
  normalizeEnvOpts,
  resolveEnvOpts,
  normalizeEnvName,
  normalizeStringArray,
  stringifyId,
  buildQueuedRecord,
  resolvePagination,
};
