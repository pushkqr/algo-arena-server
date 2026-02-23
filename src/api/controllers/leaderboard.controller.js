const EvaluationModel = require("../../persistence/models/Evaluation.model");
const ResultModel = require("../../persistence/models/Result.model");
const firebaseAdmin = require("../firebaseAdmin");
const DB = require("../../utils/DB");

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const DEFAULT_PROFILE_CACHE_TTL_MS = 60_000;
const DEFAULT_PROFILE_CACHE_MAX_ENTRIES = 5_000;

const profileCache = new Map();

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

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getProfileCacheTtlMs() {
  return normalizePositiveInt(
    process.env.LEADERBOARD_PROFILE_CACHE_TTL_MS,
    DEFAULT_PROFILE_CACHE_TTL_MS,
  );
}

function getProfileCacheMaxEntries() {
  return normalizePositiveInt(
    process.env.LEADERBOARD_PROFILE_CACHE_MAX_ENTRIES,
    DEFAULT_PROFILE_CACHE_MAX_ENTRIES,
  );
}

function resolveUsernamePolicy() {
  const raw = String(process.env.LEADERBOARD_USERNAME_POLICY || "")
    .trim()
    .toLowerCase();

  if (raw === "display_name_only" || raw === "displaynameonly") {
    return "display_name_only";
  }

  return "display_name_or_fallback";
}

function getCachedProfile(uid) {
  const key = normalizeString(uid);
  if (!key) {
    return { hit: false, value: null };
  }

  const cached = profileCache.get(key);
  if (!cached) {
    return { hit: false, value: null };
  }

  if (cached.expiresAt <= Date.now()) {
    profileCache.delete(key);
    return { hit: false, value: null };
  }

  return { hit: true, value: cached.value };
}

function setCachedProfile(uid, value) {
  const key = normalizeString(uid);
  if (!key) return;

  const maxEntries = getProfileCacheMaxEntries();
  if (profileCache.size >= maxEntries) {
    const firstKey = profileCache.keys().next().value;
    if (firstKey) {
      profileCache.delete(firstKey);
    }
  }

  profileCache.set(key, {
    value,
    expiresAt: Date.now() + getProfileCacheTtlMs(),
  });
}

function deriveUsername(profile = {}, policy = "display_name_or_fallback") {
  const displayName =
    typeof profile.displayName === "string" ? profile.displayName.trim() : "";
  if (displayName) {
    return displayName;
  }

  if (policy === "display_name_only") {
    return null;
  }

  const fallbackHandle =
    typeof profile.uid === "string" && profile.uid.trim()
      ? `user_${profile.uid.trim().slice(0, 8)}`
      : null;

  if (fallbackHandle) {
    return fallbackHandle;
  }

  return null;
}

async function loadProfilesByUid(uids = []) {
  const validUids = (uids || []).filter(
    (uid) => typeof uid === "string" && uid,
  );
  if (!validUids.length) {
    return new Map();
  }

  const profileMap = new Map();
  const uncachedUids = [];

  for (const uid of validUids) {
    const cached = getCachedProfile(uid);
    if (cached.hit) {
      profileMap.set(uid, cached.value);
    } else {
      uncachedUids.push(uid);
    }
  }

  if (!uncachedUids.length) {
    return profileMap;
  }

  const batchSize = 100;

  for (let i = 0; i < uncachedUids.length; i += batchSize) {
    const slice = uncachedUids.slice(i, i + batchSize);
    const response = await firebaseAdmin
      .auth()
      .getUsers(slice.map((uid) => ({ uid })));

    for (const user of response.users || []) {
      if (!user || !user.uid) continue;
      const profile = {
        uid: user.uid,
        displayName: user.displayName || null,
      };
      profileMap.set(user.uid, profile);
      setCachedProfile(user.uid, profile);
    }

    for (const missing of response.notFound || []) {
      if (!missing || !missing.uid) continue;
      profileMap.set(missing.uid, null);
      setCachedProfile(missing.uid, null);
    }
  }

  return profileMap;
}

async function enrichResultsWithOwnerProfiles(results = []) {
  const usernamePolicy = resolveUsernamePolicy();
  const ownerIds = Array.from(
    new Set(
      (results || [])
        .map((row) => normalizeString(row.agentOwnerId))
        .filter(Boolean),
    ),
  );

  if (!ownerIds.length) {
    return results;
  }

  let profileMap = new Map();
  try {
    profileMap = await loadProfilesByUid(ownerIds);
  } catch (err) {
    console.error("failed to resolve owner profiles", err);
    profileMap = new Map();
  }

  return (results || []).map((row) => {
    const ownerId = normalizeString(row.agentOwnerId);
    const profile = ownerId ? profileMap.get(ownerId) : null;
    const username = deriveUsername(
      profile || { uid: ownerId },
      usernamePolicy,
    );

    return {
      ...row,
      ownerProfile: {
        username,
      },
    };
  });
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

    const enrichedResults = await enrichResultsWithOwnerProfiles(results);

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
      results: enrichedResults,
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
