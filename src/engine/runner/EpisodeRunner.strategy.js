const fs = require("fs");
const path = require("path");
const StrategyLoader = require("../../domain/strategy/StrategyLoader");

const strategyCache = new Map();

function cacheKeyForAgentSpec(spec) {
  if (spec.path) return `path:${spec.path}`;
  const src = String(spec.source || spec.code || "");
  return `src:${Buffer.from(src).toString("base64").slice(0, 40)}`;
}

function loadStrategyFromSpec(spec) {
  const id = spec.id || spec.agentId || spec.name || "<anon>";
  try {
    let code;
    let name = spec.name || id;
    if (spec.path) {
      const filePath = spec.path;
      code = fs.readFileSync(filePath, "utf8");
      name = name || path.basename(filePath, path.extname(filePath));
    } else {
      code = spec.source || spec.code || "";
    }

    if (!code) return { module: null, error: new Error("no code provided") };

    const loaded = StrategyLoader.loadStrategy({ name, code });
    if (loaded && loaded.module && typeof loaded.module.act === "function") {
      return { module: loaded.module, error: null };
    }

    return {
      module: null,
      error:
        loaded && loaded.error ? loaded.error : new Error("invalid strategy"),
    };
  } catch (err) {
    return { module: null, error: err };
  }
}

async function prepareAgents(agentsSpec = []) {
  const prepared = [];
  for (const spec of agentsSpec) {
    const id = spec.id || spec.agentId || spec.name;
    const ownerId = spec.ownerId || spec.userId || null;
    const key = cacheKeyForAgentSpec(spec);

    if (strategyCache.has(key)) {
      prepared.push({ id, strategy: strategyCache.get(key), ownerId });
      continue;
    }

    const { module, error } = loadStrategyFromSpec(spec);
    if (module) {
      strategyCache.set(key, module);
      prepared.push({ id, strategy: module, ownerId });
    } else {
      prepared.push({
        id,
        strategy: null,
        loadError: error && error.message ? error.message : String(error),
        ownerId,
      });
    }
  }

  return prepared;
}

module.exports = {
  prepareAgents,
};
